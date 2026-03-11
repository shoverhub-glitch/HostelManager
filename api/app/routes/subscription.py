from fastapi import APIRouter, Depends, HTTPException, Body, Request
from app.utils.helpers import get_current_user
from app.services.subscription_service import SubscriptionService
from app.services.plan_service import PlanService
from app.services.subscription_enforcement import SubscriptionEnforcement
from app.services.subscription_lifecycle import SubscriptionLifecycle
from app.services.razorpay_service import RazorpayService
from app.services.coupon_service import CouponService
from app.services.razorpay_webhook_service import RazorpayWebhookService

router = APIRouter(prefix="/subscription", tags=["subscription"])


@router.post("/webhook")
async def razorpay_webhook(request: Request):
    """
    Handle Razorpay webhooks for payment notifications.
    Critical for 100% reliability in case of network/app failure.
    """
    try:
        signature = request.headers.get("X-Razorpay-Signature")
        if not signature:
            raise HTTPException(status_code=400, detail="Missing signature")
            
        body = await request.body()
        
        # Verify webhook signature
        if not RazorpayWebhookService.verify_signature(body, signature):
            raise HTTPException(status_code=400, detail="Invalid signature")
            
        event_data = await request.json()
        result = await RazorpayWebhookService.process_webhook(event_data)
        return result
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Webhook error: {str(e)}")
        # Always return 200 to Razorpay to prevent retries of invalid/failing events
        return {"status": "error", "message": str(e)}


@router.get("")
async def get_subscription(user_id: str = Depends(get_current_user)):
    try:
        sub = await SubscriptionService.get_subscription(user_id)
        return {"data": sub.model_dump()}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving subscription. Please try again."
        )


@router.get("/plans")
async def get_all_plans():
    """Get all available subscription plans with their pricing tiers"""
    try:
        plans = await SubscriptionService.get_all_plans()
        return {"data": plans}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving subscription plans. Please try again."
        )


@router.get("/usage")
async def get_usage(user_id: str = Depends(get_current_user)):
    try:
        usage = await SubscriptionService.get_usage(user_id)
        return {"data": usage.model_dump()}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving usage data. Please try again."
        )


@router.get("/quota-warnings")
async def get_quota_warnings(user_id: str = Depends(get_current_user)):
    """Get quota usage warnings if approaching limits (80%+)"""
    try:
        warnings = await SubscriptionEnforcement.get_usage_warning(user_id)
        if warnings:
            return {"data": warnings}
        return {"data": None}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error checking quota warnings. Please try again."
        )


@router.get("/limits/{plan}")
async def get_limits(plan: str):
    try:
        limits = await SubscriptionService.get_plan_limits(plan)
        if not limits:
            raise HTTPException(status_code=404, detail="Plan not found")
        return {"data": limits}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error retrieving plan limits.")


@router.post("/upgrade")
async def upgrade_subscription(
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user)
):
    try:
        plan = payload.get("plan")
        period = payload.get("period", 1)
        
        if not plan:
            raise HTTPException(status_code=400, detail="Plan is required")
        
        # Validate period for the plan
        available_periods = await PlanService.get_available_periods(plan)
        if period not in available_periods:
            raise HTTPException(status_code=400, detail=f"Period {period} not available for {plan} plan. Available: {available_periods}")
        
        # Get current subscription to track change
        current_sub = await SubscriptionService.get_subscription(user_id)
        old_plan = current_sub.plan
        
        # Update subscription
        sub = await SubscriptionService.update_subscription(user_id, plan, period)
        
        # If upgrading, restore archived resources
        if plan != old_plan and old_plan != 'free':
            restore_result = await SubscriptionLifecycle.handle_upgrade(user_id, plan)
            if restore_result.get("success"):
                sub_dict = sub.model_dump()
                sub_dict["archived_resources_restored"] = restore_result
                return {"data": sub_dict}
        
        return {"data": sub.model_dump()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error updating subscription. Please try again."
        )

@router.post("/create-checkout-session")
async def create_checkout_session(
    payload: dict = Body(...),
    user_id: str = Depends(get_current_user)
):
    try:
        plan = payload.get("plan")
        period = payload.get("period", 1)
        coupon_code = payload.get("coupon_code", "").strip()
        
        if not plan:
            raise HTTPException(status_code=400, detail="Plan is required")
        if plan == 'free':
            raise HTTPException(status_code=400, detail="Free plan does not require payment.")
        
        # Validate and get price for this plan and period
        available_periods = await PlanService.get_available_periods(plan)
        if period not in available_periods:
            raise HTTPException(status_code=400, detail=f"Period {period} not available for {plan} plan")
        
        price = await PlanService.get_plan_price(plan, period)
        if price <= 0:
            raise HTTPException(status_code=400, detail="Invalid price for this plan and period")
        
        amount = price  # Already in paise
        discount_amount = 0
        final_amount = amount
        
        # Apply coupon if provided
        if coupon_code:
            coupon_response = await CouponService.apply_coupon(coupon_code, amount, plan)
            if not coupon_response.isValid:
                raise HTTPException(status_code=400, detail=f"Invalid coupon: {coupon_response.message}")
            
            final_amount = coupon_response.finalAmount
            discount_amount = coupon_response.discountAmount
        
        currency = 'INR'
        
        # Ensure receipt is <= 40 chars for Razorpay
        base_receipt = f"sub_{plan}_{period}m"
        user_part = user_id[:40 - len(base_receipt) - 1]  # leave room for underscore
        receipt = f"{base_receipt}_{user_part}"
        
        order_doc = await RazorpayService.create_order(
            user_id, plan, period, final_amount, currency, receipt, 
            coupon_code=coupon_code if coupon_code else None
        )
        return {
            "data": {
                "razorpayOrderId": order_doc.order_id,
                "amount": final_amount,
                "originalAmount": amount,
                "discountAmount": discount_amount,
                "couponCode": coupon_code if coupon_code else None,
                "currency": order_doc.currency,
                "keyId": RazorpayService.client.auth[0]
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error creating checkout session. Please try again."
        )


# Razorpay: Verify Payment
@router.post("/verify-payment")
async def verify_payment(payload: dict, user_id: str = Depends(get_current_user)):
    try:
        payment_id = payload.get("payment_id")
        order_id = payload.get("order_id")
        signature = payload.get("signature")
        if not (payment_id and order_id and signature):
            raise HTTPException(status_code=400, detail="Missing payment verification fields")

        success, plan_data, coupon_code = await RazorpayService.verify_payment(order_id, payment_id, signature)
        if not success:
            return {"data": {"success": False, "error": plan_data}}

        # plan_data now contains {"plan": "pro", "period": 3}
        plan = plan_data["plan"]
        period = plan_data.get("period", 1)
        
        await SubscriptionService.update_subscription(user_id, plan, period)
        
        # Apply coupon usage if coupon was used
        if coupon_code:
            await CouponService.increment_usage(coupon_code)
        
        return {
            "data": {
                "success": True, 
                "subscription": plan, 
                "period": period,
                "couponApplied": coupon_code is not None,
                "couponCode": coupon_code if coupon_code else None
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error verifying payment. Please try again."
        )


@router.get("/downgrade-check")
async def downgrade_check(user_id: str = Depends(get_current_user)):
    """Check if user can downgrade to free tier"""
    try:
        eligibility = await SubscriptionService.check_downgrade_eligibility(user_id)
        return {"data": eligibility}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error checking downgrade eligibility. Please try again."
        )


@router.post("/cancel")
async def cancel_subscription(user_id: str = Depends(get_current_user)):
    """Cancel subscription and downgrade to free plan with resource archival"""
    try:
        # Check if user can downgrade
        eligibility = await SubscriptionService.check_downgrade_eligibility(user_id)
        
        # Get current subscription
        current_sub = await SubscriptionService.get_subscription(user_id)
        old_plan = current_sub.plan
        
        # Handle downgrade - archives excess resources instead of deleting
        downgrade_result = await SubscriptionLifecycle.handle_downgrade(user_id, old_plan, "free")
        
        if not downgrade_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail="Error processing subscription downgrade. Please try again."
            )
        
        # Cancel subscription
        sub = await SubscriptionService.cancel_subscription(user_id)
        
        # Return subscription with archival info
        sub_dict = sub.model_dump()
        sub_dict["downgrade_info"] = {
            "archived_properties": downgrade_result.get("archived_properties", []),
            "archived_tenants": downgrade_result.get("archived_tenants", []),
            "grace_period_until": downgrade_result.get("grace_period_until"),
            "message": downgrade_result.get("message")
        }
        
        return {"data": sub_dict}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error canceling subscription. Please try again."
        )


@router.get("/archived-resources")
async def get_archived_resources(user_id: str = Depends(get_current_user)):
    """
    Get all archived resources from subscription downgrades.
    Shows what was archived and when it expires if not recovered.
    """
    try:
        archived = await SubscriptionLifecycle.get_archived_resources(user_id)
        return {"data": archived}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving archived resources. Please try again."
        )


@router.post("/recover-archived-resources")
async def recover_archived_resources(user_id: str = Depends(get_current_user)):
    """
    Recover archived resources by upgrading subscription.
    User must be on a plan that supports the number of resources.
    """
    try:
        # Get current subscription
        sub = await SubscriptionService.get_subscription(user_id)
        
        # If already on a plan with enough capacity, restore resources
        if sub.plan != "free":
            restore_result = await SubscriptionLifecycle.handle_upgrade(user_id, sub.plan)
            if restore_result.get("success"):
                return {
                    "data": {
                        "success": True,
                        "restored_resources": restore_result
                    }
                }
        
        # User must upgrade
        raise HTTPException(
            status_code=402,
            detail="You need to upgrade your subscription to recover archived resources."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error recovering archived resources. Please try again."
        )

@router.get("/all")
async def get_all_subscriptions(user_id: str = Depends(get_current_user)):
    """
    Get all 3 subscription documents (free, pro, premium) for the current user.
    Each subscription shows plan details including limits and pricing.
    """
    try:
        from app.database.mongodb import db
        
        subs = await db["subscriptions"].find(
            {"ownerId": user_id}
        ).to_list(length=None)
        
        if not subs:
            raise HTTPException(
                status_code=404,
                detail="No subscriptions found for user. Please contact support."
            )
        
        # Sort by plan order: free, pro, premium
        plan_order = {"free": 0, "pro": 1, "premium": 2}
        subs.sort(key=lambda x: plan_order.get(x.get("plan"), 999))

        # Normalize Mongo documents for JSON response
        serialized_subs = []
        for sub in subs:
            doc = dict(sub)
            mongo_id = doc.pop("_id", None)
            if mongo_id is not None:
                doc["id"] = str(mongo_id)

            if "ownerId" in doc and doc["ownerId"] is not None:
                doc["ownerId"] = str(doc["ownerId"])

            serialized_subs.append(doc)
        
        return {
            "data": {
                "user_id": user_id,
                "count": len(serialized_subs),
                "subscriptions": serialized_subs
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error retrieving subscriptions. Please try again."
        )


@router.post("/initialize")
async def initialize_subscriptions(user_id: str = Depends(get_current_user)):
    """
    Initialize free subscription for user if not exists.
    Creates a single subscription document that will be updated when plan changes.
    """
    try:
        from app.database.mongodb import db
        
        # Check if user has a subscription
        existing_sub = await db["subscriptions"].find_one({"ownerId": user_id})
        
        if existing_sub:
            return {
                "data": {
                    "success": True,
                    "message": "User already has an active subscription",
                    "subscriptions_created": 0,
                    "plan": existing_sub.get("plan", "free")
                }
            }
        
        # Create default free subscription
        result = await SubscriptionService.create_default_subscriptions(user_id)
        
        if result["success"]:
            return {
                "data": {
                    "success": True,
                    "message": result["message"],
                    "subscriptions_created": result["subscriptions_created"],
                    "plan": result.get("plan", "free")
                }
            }
        else:
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to create subscription")
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error initializing subscription. Please try again."
        )


@router.post("/auto-renewal/enable")
async def enable_auto_renewal(user_id: str = Depends(get_current_user)):
    """Enable automatic renewal for current subscription"""
    try:
        success = await SubscriptionService.enable_auto_renewal(user_id)
        if success:
            return {
                "data": {
                    "success": True,
                    "message": "Auto-renewal enabled. Your subscription will renew automatically.",
                    "autoRenewal": True
                }
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="No active subscription found"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error enabling auto-renewal. Please try again."
        )


@router.post("/auto-renewal/disable")
async def disable_auto_renewal(user_id: str = Depends(get_current_user)):
    """Disable automatic renewal for current subscription"""
    try:
        success = await SubscriptionService.disable_auto_renewal(user_id)
        if success:
            return {
                "data": {
                    "success": True,
                    "message": "Auto-renewal disabled. Your subscription will expire after current period.",
                    "autoRenewal": False
                }
            }
        else:
            raise HTTPException(
                status_code=404,
                detail="No active subscription found"
            )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error disabling auto-renewal. Please try again."
        )


@router.post("/cancel")
async def cancel_subscription(user_id: str = Depends(get_current_user)):
    """Cancel active subscription and downgrade to free plan"""
    try:
        result = await SubscriptionService.cancel_subscription(user_id)
        return {
            "data": {
                "success": True,
                "message": result.get("message", "Subscription cancelled successfully"),
                "plan": result.get("plan", "free")
            }
        }
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Error cancelling subscription. Please try again."
        )
