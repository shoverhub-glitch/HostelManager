"""
Subscription Enforcement Service
Checks quota limits and subscription status before allowing resource creation
Also enforces archival status to prevent modification of suspended resources
"""

from fastapi import HTTPException, status
from app.services.subscription_service import SubscriptionService
from app.database.mongodb import db
from bson import ObjectId
from typing import Literal
from datetime import datetime, timezone
from app.utils.ownership import build_owner_query, property_belongs_to_owner
import logging

logger = logging.getLogger(__name__)


class SubscriptionEnforcement:
    """
    Enforce subscription limits on quota-protected resources.
    
    Rules:
    - Free plan: max 2 properties, 20 tenants
    - Pro plan: max 10 properties, 100 tenants
    - Premium plan: unlimited
    
    Expired subscriptions can READ but not CREATE resources.
    
    Archived Resources:
    - Cannot be modified (updated/deleted)
    - Can only be viewed
    - Restored if user upgrades within grace period
    - Permanently deleted 30 days after archival
    """

    @staticmethod
    async def ensure_can_create_property(owner_id: str) -> None:
        """
        Check if owner can create a new property.
        
        Raises:
            HTTPException 402: If subscription is expired or quota exceeded
        """
        try:
            # Get subscription
            sub = await SubscriptionService.get_subscription(owner_id)

            # Check subscription status and date
            now = datetime.now(timezone.utc)
            expiry = datetime.fromisoformat(sub.currentPeriodEnd.replace('Z', '+00:00'))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)

            if sub.status == "expired" or expiry < now:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Subscription expired on {sub.currentPeriodEnd}. Please renew to proceed."
                )

            # Get plan limits
            limits = await SubscriptionService.get_plan_limits(sub.plan)
            
            # If plan not found in database, use fallback limits
            if not limits:
                logger.warning(f"Plan {sub.plan} not found in database, using fallback limits")
                limits = {"properties": 1, "tenants": 80, "rooms": 30, "staff": 3}

            # Count existing properties using string owner_id
            current = await db["properties"].count_documents(build_owner_query(owner_id))

            # Check quota
            if current >= limits["properties"]:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"You've reached the limit of {limits['properties']} properties on {sub.plan.title()} plan. "
                            f"Upgrade your subscription to add more properties."
                )

            logger.info(
                f"Property creation allowed for {owner_id} ({sub.plan} plan, {current}/{limits['properties']} used)"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking property quota: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error checking subscription quota. Please try again."
            )

    @staticmethod
    async def ensure_can_create_tenant(owner_id: str, property_id: str) -> None:
        """
        Check if owner can create a new tenant under this property.
        
        Raises:
            HTTPException 402: If subscription is expired or tenant quota exceeded per property
            HTTPException 403: If property doesn't belong to this owner
        """
        try:
            # Verify property ownership
            property_doc = await db["properties"].find_one(
                {"_id": ObjectId(property_id)}
            )

            if not property_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Property not found"
                )

            if not property_belongs_to_owner(property_doc, owner_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This property does not belong to you"
                )

            # Get subscription
            sub = await SubscriptionService.get_subscription(owner_id)

            # Check subscription status
            if sub.status == "expired":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Subscription expired on {sub.currentPeriodEnd}. Please renew to create tenants."
                )

            # Get plan limits
            limits = await SubscriptionService.get_plan_limits(sub.plan)
            
            # If plan not found in database, use fallback limits
            if not limits:
                logger.warning(f"Plan {sub.plan} not found in database, using fallback limits")
                limits = {"properties": 1, "tenants": 80, "rooms": 30, "staff": 3}

            # Count existing tenants in THIS property only (not across all properties)
            current = await db["tenants"].count_documents(
                {"propertyId": property_id}
            )

            # Check quota (max tenants per property)
            if current >= limits["tenants"]:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"You've reached the limit of {limits['tenants']} tenants per property on {sub.plan.title()} plan. "
                            f"Upgrade your subscription to add more tenants."
                )

            logger.info(
                f"Tenant creation allowed for {owner_id} ({sub.plan} plan, {current}/{limits['tenants']} tenants in this property)"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking tenant quota: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error checking subscription quota. Please try again."
            )

    @staticmethod
    async def ensure_can_create_room(owner_id: str, property_id: str) -> None:
        """
        Check if owner can create a new room in this property.
        
        Raises:
            HTTPException 402: If subscription is expired or room quota exceeded per property
            HTTPException 403: If property doesn't belong to this owner
        """
        try:
            # Verify property ownership
            property_doc = await db["properties"].find_one(
                {"_id": ObjectId(property_id)}
            )

            if not property_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Property not found"
                )

            if not property_belongs_to_owner(property_doc, owner_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This property does not belong to you"
                )

            # Get subscription
            sub = await SubscriptionService.get_subscription(owner_id)

            # Check subscription status
            if sub.status == "expired":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Subscription expired on {sub.currentPeriodEnd}. Please renew to create rooms."
                )

            # Get plan limits
            limits = await SubscriptionService.get_plan_limits(sub.plan)
            
            # If plan not found in database, use fallback limits
            if not limits:
                logger.warning(f"Plan {sub.plan} not found in database, using fallback limits")
                limits = {"properties": 1, "tenants": 80, "rooms": 30, "staff": 3}

            # Count existing rooms in THIS property
            current = await db["rooms"].count_documents(
                {"propertyId": property_id}
            )

            # Check quota (30 rooms per property)
            room_limit = limits["rooms"]
            if current >= room_limit:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"You've reached the limit of {room_limit} rooms per property. "
                            f"Delete some rooms or upgrade your subscription."
                )

            logger.info(
                f"Room creation allowed for {owner_id} ({sub.plan} plan, {current}/{room_limit} rooms in property)"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking room quota: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error checking subscription quota. Please try again."
            )

    @staticmethod
    async def ensure_can_create_staff(owner_id: str, property_id: str) -> None:
        """
        Check if owner can create a new staff member in this property.
        
        Raises:
            HTTPException 402: If subscription is expired or staff quota exceeded
            HTTPException 403: If property doesn't belong to this owner
        """
        try:
            # Verify property ownership
            property_doc = await db["properties"].find_one(
                {"_id": ObjectId(property_id)}
            )

            if not property_doc:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Property not found"
                )

            if not property_belongs_to_owner(property_doc, owner_id):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="This property does not belong to you"
                )

            # Get subscription
            sub = await SubscriptionService.get_subscription(owner_id)

            # Check subscription status
            if sub.status == "expired":
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"Subscription expired on {sub.currentPeriodEnd}. Please renew to add staff members."
                )

            # Get plan limits
            limits = await SubscriptionService.get_plan_limits(sub.plan)
            
            # If plan not found in database, use fallback limits
            if not limits:
                logger.warning(f"Plan {sub.plan} not found in database, using fallback limits")
                limits = {"properties": 1, "tenants": 80, "rooms": 30, "staff": 3}

            # Count existing staff in THIS property (not archived)
            current = await db["staff"].count_documents(
                {"propertyId": property_id, "archived": False}
            )

            # Check quota
            staff_limit = limits["staff"]
            if current >= staff_limit:
                raise HTTPException(
                    status_code=status.HTTP_402_PAYMENT_REQUIRED,
                    detail=f"You've reached the limit of {staff_limit} staff members on {sub.plan.title()} plan. "
                            f"Upgrade your subscription to add more staff."
                )

            logger.info(
                f"Staff creation allowed for {owner_id} ({sub.plan} plan, {current}/{staff_limit} staff in property)"
            )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking staff quota: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Error checking subscription quota. Please try again."
            )

    @staticmethod
    async def get_usage_warning(owner_id: str) -> dict | None:
        """
        Check if owner is approaching quota limits and return warning.
        
        Returns:
            dict with usage info if warning threshold reached (80%), else None
        """
        try:
            sub = await SubscriptionService.get_subscription(owner_id)
            limits = await SubscriptionService.get_plan_limits(sub.plan)
            
            # If plan not found in database, use fallback limits
            if not limits:
                logger.warning(f"Plan {sub.plan} not found in database, using fallback limits")
                limits = {"properties": 1, "tenants": 80, "rooms": 30, "staff": 3}

            # Get actual usage
            owned_properties = await db["properties"].find(
                build_owner_query(owner_id),
                {"_id": 1}
            ).to_list(length=None)
            property_ids = [str(doc["_id"]) for doc in owned_properties]

            properties = len(property_ids)
            tenants = await db["tenants"].count_documents(
                {"propertyId": {"$in": property_ids}}
            ) if property_ids else 0

            warnings = []

            # Check properties usage (warn at 80%)
            properties_percent = (properties / limits["properties"]) * 100 if limits["properties"] > 0 else 0
            if properties_percent >= 80:
                warnings.append({
                    "type": "properties",
                    "current": properties,
                    "limit": limits["properties"],
                    "percent": int(properties_percent),
                    "message": f"You're using {properties}/{limits['properties']} properties ({int(properties_percent)}%)"
                })

            # Check tenants usage (warn at 80%)
            tenants_percent = (tenants / limits["tenants"]) * 100 if limits["tenants"] > 0 else 0
            if tenants_percent >= 80:
                warnings.append({
                    "type": "tenants",
                    "current": tenants,
                    "limit": limits["tenants"],
                    "percent": int(tenants_percent),
                    "message": f"You're using {tenants}/{limits['tenants']} tenants ({int(tenants_percent)}%)"
                })

            if warnings:
                return {
                    "plan": sub.plan,
                    "warnings": warnings,
                    "upgrade_url": "/subscription/upgrade"
                }

            return None
        except Exception as e:
            logger.error(f"Error getting usage warnings: {str(e)}")
            return None

    @staticmethod
    async def ensure_property_not_archived(property_id: str) -> None:
        """
        Check if a property is archived due to subscription downgrade.
        Archived properties cannot be modified.
        
        Raises:
            HTTPException 403: If property is archived
        """
        try:
            prop = await db["properties"].find_one({"_id": ObjectId(property_id)})
            
            if not prop:
                return
            
            if not prop.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"This property is archived: {prop.get('archivedReason')}. "
                           f"Upgrade your subscription to recover this property."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking property archive status: {str(e)}")

    @staticmethod
    async def ensure_room_not_archived(room_id: str) -> None:
        """
        Check if a room is archived due to subscription downgrade.
        Archived rooms cannot be modified.
        
        Raises:
            HTTPException 403: If room is archived
        """
        try:
            room = await db["rooms"].find_one({"_id": ObjectId(room_id)})
            
            if not room:
                return
            
            if not room.get("active", True):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"This room is archived: {room.get('archivedReason')}. "
                           f"Upgrade your subscription to recover this room."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking room archive status: {str(e)}")

    @staticmethod
    async def ensure_tenant_not_archived(tenant_id: str) -> None:
        """
        Check if a tenant is archived due to subscription downgrade.
        Archived tenants cannot be modified.
        
        Raises:
            HTTPException 403: If tenant is archived
        """
        try:
            tenant = await db["tenants"].find_one({"_id": ObjectId(tenant_id)})
            
            if not tenant:
                return
            
            if tenant.get("archived", False):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"This tenant is archived: {tenant.get('archivedReason')}. "
                           f"Upgrade your subscription to recover this tenant."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking tenant archive status: {str(e)}")

