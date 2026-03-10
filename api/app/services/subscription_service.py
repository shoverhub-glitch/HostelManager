from typing import Dict

from app.models.subscription_schema import Subscription, Usage
from app.database.mongodb import db
from datetime import datetime, timedelta
from app.utils.ownership import build_owner_query
import logging
from app.config.default_plans import get_default_plan

logger = logging.getLogger(__name__)

# Plans are now stored in the database 'plans' collection
# Use PlanService to manage plans (create, update, delete)
# This allows admin to dynamically manage plans without code changes

def format_price_text(price_paise: int) -> str:
    """Convert price in paise to formatted rupee text (e.g., 999 -> ₹9.99, 2499 -> ₹24.99)"""
    if price_paise == 0:
        return "₹0"
    rupees = price_paise / 100
    if rupees == int(rupees):
        return f"₹{int(rupees)}"
    return f"₹{rupees:.2f}".rstrip('0').rstrip('.')

class SubscriptionService:
    @staticmethod
    async def get_subscription(owner_id: str):
        """Get active subscription for owner, creating default if not exists"""
        try:
            # Find active subscription (highest tier that is active)
            doc = await db["subscriptions"].find_one(
                {"ownerId": owner_id, "status": "active"},
                sort=[("plan", -1)]  # Sort by plan name descending to get premium > pro > free
            )
            if doc:
                return Subscription(**doc)
        except Exception as e:
            logger.error(f"Error retrieving subscription: {str(e)}")
        
        # If not found or error, create default free subscription
        now = datetime.now().isoformat()
        
        # Fetch free plan from database
        free_plan = await db.plans.find_one({"name": "free"})
        if not free_plan:
            free_plan = get_default_plan("free")
            if not free_plan:
                raise ValueError("Free plan not found in database or config")
        free_limits = {
            'properties': free_plan['properties'],
            'tenants': free_plan['tenants'],
            'rooms': free_plan['rooms'],
            'staff': free_plan['staff']
        }
        
        sub = Subscription(
            ownerId=owner_id,
            plan='free',
            period=0,  # Free plan has no period
            status='active',
            price=0,
            currentPeriodStart=now,
            currentPeriodEnd=(datetime.now() + timedelta(days=365)).isoformat(),  # 1 year for free
            propertyLimit=free_limits['properties'],
            roomLimit=free_limits['rooms'],
            tenantLimit=free_limits['tenants'],
            staffLimit=free_limits['staff'],
            createdAt=now,
            updatedAt=now
        )
        try:
            await db["subscriptions"].insert_one(sub.model_dump())
        except Exception as e:
            logger.error(f"Error creating default subscription: {str(e)}")
        return sub

    @staticmethod
    async def update_subscription(owner_id: str, plan: str, period: int = 1):
        """
        Update subscription plan with dynamic period support.
        Updates the single subscription document for the user.
        
        Args:
            owner_id: User ID
            plan: Plan name (e.g., 'free', 'pro', 'premium')
            period: Billing period in months (1, 3, 12, etc.)
        """
        try:
            now = datetime.now().isoformat()
            
            # Fetch plan from database
            plan_doc = await db.plans.find_one({"name": plan.lower()})
            if not plan_doc:
                plan_doc = get_default_plan(plan)
                if not plan_doc:
                    raise ValueError(f"Plan '{plan}' not found")
            
            plan_data = {
                'properties': plan_doc['properties'],
                'tenants': plan_doc['tenants'],
                'rooms': plan_doc['rooms'],
                'staff': plan_doc['staff'],
                'periods': plan_doc.get('periods', {})
            }
            
            # For free plan, period is always 0
            if plan == 'free':
                period = 0
            
            # Validate period for non-free plans (periods dict has string keys from DB)
            periods_dict = plan_data.get('periods', {})
            period_str = str(period)
            if plan != 'free' and period_str not in periods_dict:
                raise ValueError(f"Period {period} not available for {plan} plan")
            
            price = periods_dict.get(period_str, 0) if plan != 'free' else 0
            period_end = datetime.now() + timedelta(days=period * 30 if period > 0 else 365)
            
            # Update the single subscription document for this user
            result = await db["subscriptions"].find_one_and_update(
                {"ownerId": owner_id},
                {"$set": {
                    "plan": plan,
                    "status": "active",
                    "period": period,
                    "price": price,
                    "propertyLimit": plan_data['properties'],
                    "roomLimit": plan_data['rooms'],
                    "tenantLimit": plan_data['tenants'],
                    "staffLimit": plan_data['staff'],
                    "currentPeriodStart": now,
                    "currentPeriodEnd": period_end.isoformat(),
                    "autoRenewal": True if plan != 'free' else False,
                    "updatedAt": now
                }},
                return_document=True
            )
            
            if result:
                return Subscription(**result)
            
            # If subscription doesn't exist, create it
            sub = Subscription(
                ownerId=owner_id,
                plan=plan,
                period=period,
                status='active',
                price=price,
                currentPeriodStart=now,
                currentPeriodEnd=period_end.isoformat(),
                propertyLimit=plan_data['properties'],
                roomLimit=plan_data['rooms'],
                tenantLimit=plan_data['tenants'],
                staffLimit=plan_data['staff'],
                autoRenewal=True if plan != 'free' else False,
                createdAt=now,
                updatedAt=now
            )
            await db["subscriptions"].insert_one(sub.model_dump())
            return sub
        except Exception as e:
            logger.error(f"Error updating subscription: {str(e)}")
            raise ValueError(f"Failed to update subscription: {str(e)}")

    @staticmethod
    async def get_usage(owner_id: str):
        """Get current resource usage for subscription quota checking"""
        try:
            # Count properties using ownerIds/ownerId-compatible query
            owned_properties = await db["properties"].find(
                build_owner_query(owner_id),
                {"_id": 1}
            ).to_list(length=None)
            property_ids = [str(doc["_id"]) for doc in owned_properties]

            properties = len(property_ids)
            tenants = await db["tenants"].count_documents({"propertyId": {"$in": property_ids}}) if property_ids else 0
            rooms = await db["rooms"].count_documents({"propertyId": {"$in": property_ids}}) if property_ids else 0
            staff = await db["staff"].count_documents({"propertyId": {"$in": property_ids}}) if property_ids else 0
            now = datetime.now().isoformat()
            return Usage(
                ownerId=owner_id,
                properties=properties,
                tenants=tenants,
                rooms=rooms,
                staff=staff,
                updatedAt=now
            )
        except Exception as e:
            logger.error(f"Error getting usage for {owner_id}: {str(e)}")
            # Return zero usage on error so user can still access the system
            now = datetime.now().isoformat()
            return Usage(
                ownerId=owner_id,
                properties=0,
                tenants=0,
                rooms=0,
                staff=0,
                updatedAt=now
            )

    @staticmethod
    async def get_plan_limits(plan: str):
        """Get features/limits for a plan from database"""
        plan_doc = await db.plans.find_one({"name": plan.lower()})
        if not plan_doc:
            plan_doc = get_default_plan(plan)
            if not plan_doc:
                return None
        return {
            'properties': plan_doc['properties'],
            'tenants': plan_doc['tenants'],
            'rooms': plan_doc['rooms'],
            'staff': plan_doc['staff'],
        }

    @staticmethod
    async def get_all_plans():
        """Get all available plans with their pricing tiers from database"""
        cursor = db.plans.find({"is_active": True}).sort("sort_order", 1)
        result = []
        
        async for plan_doc in cursor:
            plan_info = {
                'name': plan_doc['name'],
                'properties': plan_doc['properties'],
                'tenants': plan_doc['tenants'],
                'rooms': plan_doc['rooms'],
                'staff': plan_doc['staff'],
                'periods': []
            }
            
            periods_dict = plan_doc.get('periods', {})
            # Convert string keys to int for proper sorting
            sorted_periods = sorted([(int(k), v) for k, v in periods_dict.items()])
            
            for period, price in sorted_periods:
                plan_info['periods'].append({
                    'period': period,
                    'price': price,
                    'priceText': format_price_text(price),
                    'pricePerMonth': price // period if period > 0 else 0
                })
            
            result.append(plan_info)
        
        return result

    @staticmethod
    async def cancel_subscription(owner_id: str):
        """Cancel subscription and downgrade to free plan"""
        try:
            now = datetime.now().isoformat()
            
            # Fetch free plan from database
            free_plan = await db.plans.find_one({"name": "free"})
            if not free_plan:
                free_plan = get_default_plan("free")
                if not free_plan:
                    raise ValueError("Free plan not found in database or config")
            free_limits = {
                'properties': free_plan['properties'],
                'tenants': free_plan['tenants'],
                'rooms': free_plan['rooms'],
                'staff': free_plan['staff']
            }
            
            period_end = (datetime.now() + timedelta(days=365)).isoformat()
            
            # Set all subscriptions to inactive first
            await db["subscriptions"].update_many(
                {"ownerId": owner_id},
                {"$set": {"status": "inactive"}}
            )
            
            # Activate free plan
            result = await db["subscriptions"].find_one_and_update(
                {"ownerId": owner_id, "plan": "free"},
                {"$set": {
                    "status": "active",
                    "period": 0,
                    "price": 0,
                    "currentPeriodStart": now,
                    "currentPeriodEnd": period_end,
                    "updatedAt": now,
                    "cancelledAt": now,
                    "propertyLimit": free_plan['properties'],
                    "roomLimit": free_plan['rooms'],
                    "tenantLimit": free_plan['tenants'],
                    "staffLimit": free_plan['staff'],
                }},
                return_document=True
            )
            if result:
                return Subscription(**result)
        except Exception as e:
            logger.error(f"Error cancelling subscription: {str(e)}")
        raise ValueError("Subscription not found or could not be cancelled")

    @staticmethod
    async def check_downgrade_eligibility(owner_id: str) -> dict:
        """Check if user can downgrade to free tier"""
        try:
            # Count current resources
            owned_properties = await db["properties"].find(
                build_owner_query(owner_id),
                {"_id": 1}
            ).to_list(length=None)
            property_ids = [str(doc["_id"]) for doc in owned_properties]

            property_count = len(property_ids)
            tenant_count = await db["tenants"].count_documents({"propertyId": {"$in": property_ids}}) if property_ids else 0
        except Exception as e:
            logger.error(f"Error counting resources: {str(e)}")
            return {
                "can_downgrade": False,
                "current": {"properties": 0, "tenants": 0},
                "limits": {"properties": 2, "tenants": 20},
                "excess": {"properties": 0, "tenants": 0},
                "message": "Unable to check eligibility. Please try again later."
            }
        
        # Free tier limits from database
        free_plan = await db.plans.find_one({"name": "free"})
        if not free_plan:
            free_plan = get_default_plan("free")
            if not free_plan:
                free_limits = {'properties': 1, 'tenants': 80}
            else:
                free_limits = {'properties': free_plan['properties'], 'tenants': free_plan['tenants']}
        
        # Calculate excess
        excess_properties = max(0, property_count - free_limits["properties"])
        excess_tenants = max(0, tenant_count - free_limits["tenants"])
        
        can_downgrade = excess_properties == 0 and excess_tenants == 0
        
        return {
            "can_downgrade": can_downgrade,
            "current": {
                "properties": property_count,
                "tenants": tenant_count,
            },
            "limits": {"properties": free_limits['properties'], "tenants": free_limits['tenants']},
            "excess": {
                "properties": excess_properties,
                "tenants": excess_tenants,
            },
            "message": (
                f"To downgrade to free plan, delete {excess_properties} properties "
                f"and {excess_tenants} tenants"
                if not can_downgrade
                else "You can proceed with downgrade"
            )
        }

    @staticmethod
    async def create_default_subscriptions(owner_id: str) -> dict:
        """
        Create default free subscription for a new user.
        Only creates a single subscription document that will be updated when plan changes.
        
        Returns:
            dict with created subscription details
        """
        try:
            now = datetime.now().isoformat()
            
            # Fetch free plan from database
            free_plan = await db.plans.find_one({"name": "free", "is_active": True})
            if not free_plan:
                free_plan = get_default_plan("free")
                if not free_plan:
                    return {
                        "success": False,
                        "user_id": owner_id,
                        "error": "Free plan not found in database or config",
                        "message": "Admin must initialize subscription plans first"
                    }
            
            # Create single subscription document with free plan
            period_end = (datetime.now() + timedelta(days=365)).isoformat()
            
            sub_doc = {
                "ownerId": owner_id,
                "plan": "free",
                "period": 0,
                "status": "active",
                "price": 0,
                "currentPeriodStart": now,
                "currentPeriodEnd": period_end,
                "propertyLimit": free_plan['properties'],
                "roomLimit": free_plan['rooms'],
                "tenantLimit": free_plan['tenants'],
                "staffLimit": free_plan['staff'],
                "autoRenewal": False,
                "createdAt": now,
                "updatedAt": now
            }
            
            # Upsert to handle duplicates gracefully
            await db["subscriptions"].update_one(
                {"ownerId": owner_id},
                {"$set": sub_doc},
                upsert=True
            )
            
            logger.info(f"✓ Created default free subscription for user {owner_id}")
            
            return {
                "success": True,
                "user_id": owner_id,
                "subscriptions_created": 1,
                "plan": "free",
                "message": "Free subscription created successfully"
            }
        except Exception as e:
            logger.error(f"Error creating default subscription for {owner_id}: {str(e)}")
            return {
                "success": False,
                "user_id": owner_id,
                "error": str(e),
                "message": "Failed to create default subscription"
            }

    @staticmethod
    async def enable_auto_renewal(owner_id: str) -> bool:
        """
        Enable auto-renewal for active subscription
        
        Args:
            owner_id: User ID
            
        Returns:
            True if successful
        """
        try:
            result = await db["subscriptions"].update_one(
                {"ownerId": owner_id, "status": "active"},
                {"$set": {
                    "autoRenewal": True,
                    "updatedAt": datetime.now().isoformat()
                }}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error enabling auto-renewal for {owner_id}: {str(e)}")
            raise

    @staticmethod
    async def disable_auto_renewal(owner_id: str) -> bool:
        """
        Disable auto-renewal for active subscription
        
        Args:
            owner_id: User ID
            
        Returns:
            True if successful
        """
        try:
            result = await db["subscriptions"].update_one(
                {"ownerId": owner_id, "status": "active"},
                {"$set": {
                    "autoRenewal": False,
                    "updatedAt": datetime.now().isoformat()
                }}
            )
            return result.modified_count > 0
        except Exception as e:
            logger.error(f"Error disabling auto-renewal for {owner_id}: {str(e)}")
            raise

    @staticmethod
    async def cancel_subscription(owner_id: str) -> Dict:
        """
        Cancel active subscription and Razorpay recurring subscription if exists
        
        Args:
            owner_id: User ID
            
        Returns:
            Dict with cancellation details
        """
        try:
            from app.services.razorpay_subscription_service import RazorpaySubscriptionService
            
            # Get active subscription
            sub = await db["subscriptions"].find_one(
                {"ownerId": owner_id, "status": "active"}
            )
            
            if not sub:
                raise ValueError("No active subscription found")
            
            # Cancel Razorpay subscription if exists
            if sub.get('razorpaySubscriptionId'):
                try:
                    await RazorpaySubscriptionService.cancel_recurring_subscription(
                        sub['razorpaySubscriptionId']
                    )
                except Exception as e:
                    logger.warning(f"Failed to cancel Razorpay subscription: {str(e)}")
                    # Continue anyway to mark subscription as cancelled
            
            # Downgrade to free plan
            now = datetime.now().isoformat()
            period_end = (datetime.now() + timedelta(days=365)).isoformat()
            
            free_plan = await db.plans.find_one({"name": "free"})
            if not free_plan:
                raise ValueError("Free plan not found")
            
            # Update the single subscription document to free plan
            result = await db["subscriptions"].update_one(
                {"ownerId": owner_id},
                {"$set": {
                    "plan": "free",
                    "status": "active",
                    "period": 0,
                    "price": 0,
                    "propertyLimit": free_plan['properties'],
                    "roomLimit": free_plan['rooms'],
                    "tenantLimit": free_plan['tenants'],
                    "staffLimit": free_plan['staff'],
                    "currentPeriodStart": now,
                    "currentPeriodEnd": period_end,
                    "autoRenewal": False,
                    "razorpaySubscriptionId": None,
                    "renewalError": None,
                    "updatedAt": now
                }}
            )
            
            logger.info(f"✓ Subscription cancelled for user {owner_id}")
            
            return {
                "success": True,
                "message": "Subscription cancelled and downgraded to free plan",
                "plan": "free"
            }
            
        except Exception as e:
            logger.error(f"Error cancelling subscription for {owner_id}: {str(e)}")
            raise
