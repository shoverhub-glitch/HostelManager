"""
Plan Service
Manages subscription plan CRUD operations for admin.
Plans are stored in MongoDB and used by all property owners.
"""

from datetime import datetime
from typing import Dict, List, Optional
from bson import ObjectId

from app.database.mongodb import db
from app.models.plan_schema import Plan, PlanCreate, PlanUpdate


class PlanService:
    """Service for managing subscription plans"""

    @staticmethod
    async def create_plan(plan_data: PlanCreate) -> Plan:
        """
        Create a new subscription plan (Admin only)
        
        Args:
            plan_data: Plan creation data
            
        Returns:
            Created plan
            
        Raises:
            ValueError: If plan name already exists
        """
        # Check if plan with same name exists
        existing = await db.plans.find_one({"name": plan_data.name})
        if existing:
            raise ValueError(f"Plan with name '{plan_data.name}' already exists")
        
        # Convert to dict and add timestamps
        plan_dict = plan_data.model_dump()
        plan_dict['created_at'] = datetime.utcnow()
        plan_dict['updated_at'] = datetime.utcnow()
        
        # Insert into database
        result = await db.plans.insert_one(plan_dict)
        
        # Fetch and return created plan
        created_plan = await db.plans.find_one({"_id": result.inserted_id})
        created_plan['id'] = str(created_plan['_id'])
        
        return Plan(**created_plan)

    @staticmethod
    async def get_plan_by_name(name: str) -> Optional[Plan]:
        """
        Get a plan by its name
        
        Args:
            name: Plan name
            
        Returns:
            Plan if found, None otherwise
        """
        plan = await db.plans.find_one({"name": name.lower()})
        if plan:
            plan['id'] = str(plan['_id'])
            return Plan(**plan)
        return None

    @staticmethod
    async def get_plan_by_id(plan_id: str) -> Optional[Plan]:
        """
        Get a plan by its ID
        
        Args:
            plan_id: Plan ID
            
        Returns:
            Plan if found, None otherwise
        """
        try:
            plan = await db.plans.find_one({"_id": ObjectId(plan_id)})
            if plan:
                plan['id'] = str(plan['_id'])
                return Plan(**plan)
        except Exception:
            pass
        return None

    @staticmethod
    async def get_all_plans(active_only: bool = False) -> List[Plan]:
        """
        Get all subscription plans
        
        Args:
            active_only: If True, return only active plans
            
        Returns:
            List of plans sorted by sort_order
        """
        query = {"is_active": True} if active_only else {}
        cursor = db.plans.find(query).sort("sort_order", 1)
        
        plans = []
        async for plan in cursor:
            plan['id'] = str(plan['_id'])
            plans.append(Plan(**plan))
        
        return plans

    @staticmethod
    async def update_plan(plan_name: str, update_data: PlanUpdate) -> Optional[Plan]:
        """
        Update an existing plan (Admin only)
        
        Args:
            plan_name: Name of plan to update
            update_data: Fields to update
            
        Returns:
            Updated plan if found, None otherwise
        """
        # Get existing plan
        existing = await db.plans.find_one({"name": plan_name.lower()})
        if not existing:
            return None
        
        # Prepare update dict (exclude None values)
        update_dict = update_data.model_dump(exclude_none=True)
        update_dict['updated_at'] = datetime.utcnow()
        
        # Update in database
        await db.plans.update_one(
            {"name": plan_name.lower()},
            {"$set": update_dict}
        )
        
        # Fetch and return updated plan
        updated_plan = await db.plans.find_one({"name": plan_name.lower()})
        updated_plan['id'] = str(updated_plan['_id'])
        
        return Plan(**updated_plan)

    @staticmethod
    async def delete_plan(plan_name: str) -> bool:
        """
        Delete a plan (Admin only)
        CAUTION: Should not delete plans that have active subscriptions
        
        Args:
            plan_name: Name of plan to delete
            
        Returns:
            True if deleted, False if not found
        """
        # Check if any active subscriptions use this plan
        active_count = await db.subscriptions.count_documents({
            "plan": plan_name.lower(),
            "status": "active"
        })
        
        if active_count > 0:
            raise ValueError(
                f"Cannot delete plan '{plan_name}'. "
                f"{active_count} active subscription(s) are using this plan. "
                f"Deactivate the plan instead or migrate users first."
            )
        
        result = await db.plans.delete_one({"name": plan_name.lower()})
        return result.deleted_count > 0

    @staticmethod
    async def activate_plan(plan_name: str) -> Optional[Plan]:
        """
        Activate a plan
        
        Args:
            plan_name: Name of plan to activate
            
        Returns:
            Updated plan if found, None otherwise
        """
        result = await db.plans.update_one(
            {"name": plan_name.lower()},
            {
                "$set": {
                    "is_active": True,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0 or result.matched_count > 0:
            return await PlanService.get_plan_by_name(plan_name)
        return None

    @staticmethod
    async def deactivate_plan(plan_name: str) -> Optional[Plan]:
        """
        Deactivate a plan (make it unavailable for new subscriptions)
        
        Args:
            plan_name: Name of plan to deactivate
            
        Returns:
            Updated plan if found, None otherwise
        """
        # Don't allow deactivating free plan
        if plan_name.lower() == 'free':
            raise ValueError("Cannot deactivate the 'free' plan")
        
        result = await db.plans.update_one(
            {"name": plan_name.lower()},
            {
                "$set": {
                    "is_active": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.modified_count > 0 or result.matched_count > 0:
            return await PlanService.get_plan_by_name(plan_name)
        return None

    @staticmethod
    async def get_plan_price(plan_name: str, period: int) -> int:
        """
        Get the price for a specific plan and period
        
        Args:
            plan_name: Name of the plan
            period: Billing period in months
            
        Returns:
            Price in paise
            
        Raises:
            ValueError: If plan not found or period not available
        """
        plan = await PlanService.get_plan_by_name(plan_name)
        if not plan:
            raise ValueError(f"Plan '{plan_name}' not found")
        
        if period not in plan.periods:
            available = list(plan.periods.keys())
            raise ValueError(
                f"Period {period} not available for plan '{plan_name}'. "
                f"Available periods: {available}"
            )
        
        return plan.periods[period]

    @staticmethod
    async def get_available_periods(plan_name: str) -> List[int]:
        """
        Get available billing periods for a plan
        
        Args:
            plan_name: Name of the plan
            
        Returns:
            List of available periods (sorted as integers)
        """
        plan = await PlanService.get_plan_by_name(plan_name)
        if not plan:
            return []
        
        # Periods are stored as strings in DB, convert to int for comparison
        try:
            return sorted([int(k) for k in plan.periods.keys()])
        except (ValueError, TypeError):
            # If conversion fails, return empty list
            return []

    @staticmethod
    async def create_default_plans() -> int:
        """
        Create default plans if none exist
        Used during initial setup
        
        Returns:
            Number of plans created
        """
        existing_count = await db.plans.count_documents({})
        if existing_count > 0:
            return 0  # Plans already exist
        
        default_plans = [
            {
                "name": "free",
                "display_name": "Free Plan",
                "description": "Perfect for getting started with basic features",
                "properties": 1,
                "tenants": 80,
                "rooms": 20,
                "staff": 3,
                "periods": {"0": 0},  # Free forever
                "is_active": True,
                "sort_order": 0,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
            {
                "name": "pro",
                "display_name": "Pro Plan",
                "description": "For growing businesses with multiple properties",
                "properties": 3,
                "tenants": 100,
                "rooms": 40,
                "staff": 5,
                "periods": {
                    "1": 7900,    # ₹79/month
                    "3": 20000,   # ₹66.67/month (15% savings)
                    "12": 60000   # ₹50/month (37% savings)
                },
                "is_active": True,
                "sort_order": 1,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            },
            {
                "name": "premium",
                "display_name": "Premium Plan",
                "description": "For large operations with unlimited resources",
                "properties": 5,
                "tenants": 120,
                "rooms": 60,
                "staff": 8,
                "periods": {
                    "1": 15900,   # ₹159/month
                    "3": 40000,   # ₹133.33/month (16% savings)
                    "12": 120000  # ₹100/month (37% savings)
                },
                "is_active": True,
                "sort_order": 2,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
        ]
        
        result = await db.plans.insert_many(default_plans)
        return len(result.inserted_ids)

    @staticmethod
    async def get_plan_stats() -> Dict:
        """
        Get statistics about plans
        
        Returns:
            Dict with plan statistics
        """
        total = await db.plans.count_documents({})
        active = await db.plans.count_documents({"is_active": True})
        
        # Get subscription counts per plan
        pipeline = [
            {
                "$match": {"status": "active"}
            },
            {
                "$group": {
                    "_id": "$plan",
                    "count": {"$sum": 1}
                }
            }
        ]
        
        plan_usage = {}
        async for doc in db.subscriptions.aggregate(pipeline):
            plan_usage[doc['_id']] = doc['count']
        
        return {
            "total_plans": total,
            "active_plans": active,
            "inactive_plans": total - active,
            "usage_by_plan": plan_usage
        }
