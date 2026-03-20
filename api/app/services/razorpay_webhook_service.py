"""
Razorpay Webhook Service
Handles asynchronous notifications from Razorpay to ensure data consistency
"""

import hmac
import hashlib
import json
import logging
from typing import Dict, Optional
from datetime import datetime, timezone
from app.config.settings import RAZORPAY_WEBHOOK_SECRET
from app.services.razorpay_subscription_service import RazorpaySubscriptionService
from app.services.subscription_service import SubscriptionService
from app.services.razorpay_service import RazorpayService
from app.database.mongodb import db

logger = logging.getLogger(__name__)

processed_events_collection = db["processed_webhook_events"]


class RazorpayWebhookService:
    @staticmethod
    def verify_signature(payload: bytes, signature: str) -> bool:
        """Verify that the webhook actually came from Razorpay"""
        if not RAZORPAY_WEBHOOK_SECRET:
            logger.error("RAZORPAY_WEBHOOK_SECRET not set in environment. Webhooks MUST be signed in production.")
            raise ValueError("Razorpay webhook secret not configured. Cannot verify webhook authenticity.")
            
        expected_signature = hmac.new(
            RAZORPAY_WEBHOOK_SECRET.encode(),
            payload,
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)

    @staticmethod
    async def process_webhook(event_data: Dict):
        """Process different Razorpay events with idempotency"""
        event = event_data.get("event")
        payload = event_data.get("payload", {})
        
        logger.info(f"Processing Razorpay webhook event: {event}")
        
        # order.paid is the primary event for successful order payments
        # payment.captured is a fallback if order.paid is missed
        if event in ["order.paid", "payment.captured"]:
            entity = payload.get("order", {}).get("entity") if event == "order.paid" else payload.get("payment", {}).get("entity")
            if not entity:
                logger.warning(f"No entity found in payload for event {event}")
                return {"status": "skipped", "message": "No entity found"}

            order_id = entity.get("id") if event == "order.paid" else entity.get("order_id")
            payment_id = payload.get("payment", {}).get("entity", {}).get("id") if event == "order.paid" else entity.get("id")
            notes = entity.get("notes", {})
            
            if not order_id:
                logger.warning(f"No order_id found for event {event}")
                return {"status": "skipped", "message": "No order_id"}

            # Idempotency check: skip if already processed
            existing = await processed_events_collection.find_one({"orderId": order_id})
            if existing:
                logger.info(f"Order {order_id} already processed, skipping duplicate")
                return {"status": "skipped", "message": "Already processed"}

            logger.info(f"Processing success for order {order_id}, payment {payment_id} via {event}")

            # 1. Handle Auto-renewal orders
            if notes.get("renewal") == "true":
                logger.info(f"Processing auto-renewal success for order {order_id}")
                await RazorpaySubscriptionService.handle_subscription_payment_success(order_id, payment_id)
            
            # 2. Handle standard Subscription orders (for new subscriptions/upgrades)
            # This handles the case where the app closed before verify-payment was called
            else:
                owner_id = notes.get("owner_id")
                plan = notes.get("plan")
                period = int(notes.get("period", 1))
                
                if owner_id and plan:
                    logger.info(f"Webhook fulfilling subscription update for user {owner_id}, plan {plan}")
                    await SubscriptionService.update_subscription(owner_id, plan, period)
                else:
                    logger.warning(f"Missing owner_id or plan in notes for order {order_id}: {notes}")

            # Record processed event for idempotency
            await processed_events_collection.insert_one({
                "orderId": order_id,
                "event": event,
                "paymentId": payment_id,
                "processedAt": datetime.now(timezone.utc).isoformat(),
            })

        elif event == "payment.failed":
            payment_entity = payload.get("payment", {}).get("entity", {})
            order_id = payment_entity.get("order_id")
            error_msg = payment_entity.get("error_description", "Unknown error")
            
            logger.error(f"Payment failed for order {order_id}: {error_msg}")
            
            # Handle renewal failures specifically if it was a renewal order
            notes = payment_entity.get("notes", {})
            if notes.get("renewal") == "true":
                await RazorpaySubscriptionService.handle_subscription_payment_failed(order_id, error_msg)

        elif event == "subscription.charged":
            # This is for TRUE Razorpay subscriptions (recurring)
            logger.info(f"Subscription charged event received: {payload.get('subscription', {}).get('entity', {}).get('id')}")
            pass

        return {"status": "processed"}
