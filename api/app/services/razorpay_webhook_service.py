"""
Razorpay Webhook Service
Handles asynchronous notifications from Razorpay to ensure data consistency
"""

import hmac
import hashlib
import json
import logging
from typing import Dict, Optional
from app.config.settings import RAZORPAY_WEBHOOK_SECRET
from app.services.razorpay_subscription_service import RazorpaySubscriptionService
from app.services.subscription_service import SubscriptionService
from app.services.razorpay_service import RazorpayService

logger = logging.getLogger(__name__)

class RazorpayWebhookService:
    @staticmethod
    def verify_signature(payload: bytes, signature: str) -> bool:
        """Verify that the webhook actually came from Razorpay"""
        if not RAZORPAY_WEBHOOK_SECRET:
            logger.warning("RAZORPAY_WEBHOOK_SECRET not set, skipping verification (INSECURE)")
            return True
            
        expected_signature = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)

    @staticmethod
    async def process_webhook(event_data: Dict):
        """Process different Razorpay events"""
        event = event_data.get("event")
        payload = event_data.get("payload", {})
        
        logger.info(f"Processing Razorpay webhook event: {event}")
        
        if event == "order.paid":
            order_id = payload.get("order", {}).get("entity", {}).get("id")
            payment_id = payload.get("payment", {}).get("entity", {}).get("id")
            notes = payload.get("order", {}).get("entity", {}).get("notes", {})
            
            # 1. Handle Auto-renewal orders
            if notes.get("renewal") == "true":
                await RazorpaySubscriptionService.handle_subscription_payment_success(order_id, payment_id)
            
            # 2. Handle standard Subscription orders (for new subscriptions/upgrades)
            # This handles the case where the app closed before verify-payment was called
            else:
                owner_id = notes.get("owner_id")
                plan = notes.get("plan")
                period = int(notes.get("period", 1))
                
                if owner_id and plan:
                    logger.info(f"Webhook fulfilling missed subscription update for user {owner_id}")
                    await SubscriptionService.update_subscription(owner_id, plan, period)

        elif event == "payment.failed":
            order_id = payload.get("payment", {}).get("entity", {}).get("order_id")
            error_msg = payload.get("payment", {}).get("entity", {}).get("error_description", "Unknown error")
            
            # Handle renewal failures
            await RazorpaySubscriptionService.handle_subscription_payment_failed(order_id, error_msg)

        elif event == "subscription.charged":
            # This is for TRUE Razorpay subscriptions (if used in future)
            # sub_id = payload.get("subscription", {}).get("entity", {}).get("id")
            # ... update period end ...
            pass

        return {"status": "processed"}
