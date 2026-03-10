"""
Subscription Lifecycle Management
Handles subscription downgrades, upgrades, and resource archival with grace periods
"""

from app.database.mongodb import db
from app.services.subscription_service import SubscriptionService
from datetime import datetime, timedelta
from bson import ObjectId
from app.utils.ownership import build_owner_query
import logging

logger = logging.getLogger(__name__)

ARCHIVAL_GRACE_PERIOD_DAYS = 30  # User has 30 days to upgrade before deletion


class SubscriptionLifecycle:
    """
    Production-grade subscription change handler.
    
    Strategy:
    1. When downgrading, ARCHIVE excess resources (don't delete)
    2. User gets 30-day grace period to upgrade and recover resources
    3. Archived resources are read-only
    4. If user upgrades within grace period, restore archived resources
    5. After grace period, offer permanent deletion
    """

    @staticmethod
    async def handle_downgrade(owner_id: str, from_plan: str, to_plan: str) -> dict:
        """
        Handle subscription downgrade intelligently.
        Archive excess resources instead of deleting.
        
        Returns dict with:
        - archived_properties: list of archived property IDs
        - archived_rooms: list of archived room IDs
        - archived_tenants: list of archived tenant IDs
        - message: summary message
        """
        try:
            now = datetime.now().isoformat()
            grace_period_until = (datetime.now() + timedelta(days=ARCHIVAL_GRACE_PERIOD_DAYS)).isoformat()
            
            # Get target plan limits
            target_limits = await SubscriptionService.get_plan_limits(to_plan)
            
            # Count current resources
            owned_properties = await db["properties"].find(
                {**build_owner_query(owner_id), "active": True},
                {"_id": 1}
            ).to_list(length=None)
            property_ids = [str(doc["_id"]) for doc in owned_properties]

            current_properties = len(property_ids)
            current_tenants = await db["tenants"].count_documents(
                {"propertyId": {"$in": property_ids}, "archived": False}
            ) if property_ids else 0
            
            archived_properties = []
            archived_rooms = []
            archived_tenants = []
            
            # STEP 1: Archive excess properties if needed
            if current_properties > target_limits["properties"]:
                excess_count = current_properties - target_limits["properties"]
                properties_to_archive = await db["properties"].find(
                    {**build_owner_query(owner_id), "active": True}
                ).sort("createdAt", 1).limit(excess_count).to_list(length=excess_count)
                
                for prop in properties_to_archive:
                    result = await db["properties"].update_one(
                        {"_id": prop["_id"]},
                        {
                            "$set": {
                                "active": False,
                                "archivedReason": f"Downgraded from {from_plan} to {to_plan}. Grace period until {grace_period_until}",
                                "archivedAt": now,
                                "updatedAt": now
                            }
                        }
                    )
                    if result.modified_count > 0:
                        archived_properties.append(str(prop["_id"]))
                        
                        # Archive all rooms in this property
                        archived_room_result = await db["rooms"].update_many(
                            {"propertyId": str(prop["_id"]), "active": True},
                            {
                                "$set": {
                                    "active": False,
                                    "archivedReason": f"Parent property archived. Grace period until {grace_period_until}",
                                    "archivedAt": now,
                                    "updatedAt": now
                                }
                            }
                        )
                        
                        # Archive all tenants in archived rooms of this property
                        archived_room_ids = await db["rooms"].find(
                            {"propertyId": str(prop["_id"])}
                        ).distinct("_id")
                        
                        archived_tenant_result = await db["tenants"].update_many(
                            {
                                "propertyId": str(prop["_id"]),
                                "roomId": {"$in": [str(rid) for rid in archived_room_ids]},
                                "archived": False
                            },
                            {
                                "$set": {
                                    "archived": True,
                                    "archivedReason": f"Parent room archived. Grace period until {grace_period_until}",
                                    "archivedAt": now,
                                    "updatedAt": now
                                }
                            }
                        )

            # STEP 2: Archive excess tenants (if applicable)
            if current_tenants > target_limits["tenants"]:
                excess_count = current_tenants - target_limits["tenants"]
                tenants_to_archive = await db["tenants"].find(
                    {"propertyId": {"$in": property_ids}, "archived": False}
                ).sort("createdAt", 1).limit(excess_count).to_list(length=excess_count)
                
                for tenant in tenants_to_archive:
                    result = await db["tenants"].update_one(
                        {"_id": tenant["_id"]},
                        {
                            "$set": {
                                "archived": True,
                                "archivedReason": f"Downgraded from {from_plan} to {to_plan}. Grace period until {grace_period_until}",
                                "archivedAt": now,
                                "updatedAt": now
                            }
                        }
                    )
                    if result.modified_count > 0:
                        archived_tenants.append(str(tenant["_id"]))

            logger.info(
                f"Downgrade for {owner_id}: archived {len(archived_properties)} properties, "
                f"{len(archived_rooms)} rooms, {len(archived_tenants)} tenants"
            )

            return {
                "success": True,
                "archived_properties": archived_properties,
                "archived_rooms": archived_rooms,
                "archived_tenants": archived_tenants,
                "grace_period_until": grace_period_until,
                "message": f"Downgraded to {to_plan} plan. {len(archived_properties)} properties and "
                          f"{len(archived_tenants)} tenants archived. You have until {grace_period_until} to upgrade and recover them."
            }
        except Exception as e:
            logger.error(f"Error handling downgrade for {owner_id}: {str(e)}")
            return {
                "success": False,
                "error": "Error processing downgrade. Please contact support."
            }

    @staticmethod
    async def handle_upgrade(owner_id: str, new_plan: str) -> dict:
        """
        Handle subscription upgrade by restoring archived resources.
        
        Returns dict with restored resource counts and messages.
        """
        try:
            now = datetime.now().isoformat()
            
            # Restore archived properties
            restore_prop = await db["properties"].update_many(
                {**build_owner_query(owner_id), "active": False, "archivedReason": {"$exists": True}},
                {
                    "$set": {
                        "active": True,
                        "archivedAt": None,
                        "updatedAt": now
                    },
                    "$unset": {"archivedReason": ""}
                }
            )
            
            owned_property_docs = await db["properties"].find(
                build_owner_query(owner_id),
                {"_id": 1}
            ).to_list(length=None)
            property_ids = [str(doc["_id"]) for doc in owned_property_docs]

            # Restore archived rooms
            restore_rooms = await db["rooms"].update_many(
                {"propertyId": {"$in": property_ids}, "active": False, "archivedReason": {"$exists": True}},
                {
                    "$set": {
                        "active": True,
                        "archivedAt": None,
                        "updatedAt": now
                    },
                    "$unset": {"archivedReason": ""}
                }
            )
            
            # Restore archived tenants
            restore_tenants = await db["tenants"].update_many(
                {"propertyId": {"$in": property_ids}, "archived": True, "archivedReason": {"$exists": True}},
                {
                    "$set": {
                        "archived": False,
                        "archivedAt": None,
                        "updatedAt": now
                    },
                    "$unset": {"archivedReason": ""}
                }
            )
            
            logger.info(
                f"Upgrade for {owner_id}: restored {restore_prop.modified_count} properties, "
                f"{restore_rooms.modified_count} rooms, {restore_tenants.modified_count} tenants"
            )
            
            return {
                "success": True,
                "restored_properties": restore_prop.modified_count,
                "restored_rooms": restore_rooms.modified_count,
                "restored_tenants": restore_tenants.modified_count,
                "message": f"Welcome to {new_plan.title()} plan! Your archived resources have been restored."
            }
        except Exception as e:
            logger.error(f"Error handling upgrade for {owner_id}: {str(e)}")
            return {
                "success": False,
                "error": "Error restoring resources. Please contact support."
            }

    @staticmethod
    async def get_archived_resources(owner_id: str) -> dict:
        """
        Get all archived resources for a user.
        Shows what was archived and when they expire if not recovered.
        """
        try:
            archived_properties = await db["properties"].find(
                {**build_owner_query(owner_id), "active": False}
            ).to_list(length=None)

            property_ids = [str(prop["_id"]) for prop in archived_properties]
            
            archived_rooms = await db["rooms"].find(
                {"propertyId": {"$in": property_ids}, "active": False}
            ).to_list(length=None)
            
            archived_tenants = await db["tenants"].find(
                {"propertyId": {"$in": property_ids}, "archived": True, "archivedReason": {"$exists": True}}
            ).to_list(length=None)
            
            # Calculate expiration dates from archived_at
            def calculate_expiration(archived_at: str):
                if not archived_at:
                    return None
                archived_date = datetime.fromisoformat(archived_at)
                expiration = archived_date + timedelta(days=ARCHIVAL_GRACE_PERIOD_DAYS)
                return expiration.isoformat()
            
            return {
                "total_archived": len(archived_properties) + len(archived_rooms) + len(archived_tenants),
                "properties": [
                    {
                        "id": str(p["_id"]),
                        "name": p.get("name"),
                        "archivedAt": p.get("archivedAt"),
                        "expiresAt": calculate_expiration(p.get("archivedAt")),
                        "reason": p.get("archivedReason")
                    }
                    for p in archived_properties
                ],
                "rooms": [
                    {
                        "id": str(r["_id"]),
                        "roomNumber": r.get("roomNumber"),
                        "archivedAt": r.get("archivedAt"),
                        "expiresAt": calculate_expiration(r.get("archivedAt")),
                        "reason": r.get("archivedReason")
                    }
                    for r in archived_rooms
                ],
                "tenants": [
                    {
                        "id": str(t["_id"]),
                        "name": t.get("name"),
                        "archivedAt": t.get("archivedAt"),
                        "expiresAt": calculate_expiration(t.get("archivedAt")),
                        "reason": t.get("archivedReason")
                    }
                    for t in archived_tenants
                ],
                "grace_period_days": ARCHIVAL_GRACE_PERIOD_DAYS
            }
        except Exception as e:
            logger.error(f"Error getting archived resources for {owner_id}: {str(e)}")
            return {"error": "Could not retrieve archived resources"}

    @staticmethod
    async def cleanup_expired_archives():
        """
        Scheduled task to permanently delete archived resources after grace period.
        Should be called daily by a background job.
        """
        try:
            cutoff_date = (datetime.now() - timedelta(days=ARCHIVAL_GRACE_PERIOD_DAYS)).isoformat()
            
            # Delete expired archived properties
            props = await db["properties"].delete_many({
                "active": False,
                "archivedAt": {"$lt": cutoff_date}
            })
            
            # Delete expired archived rooms
            rooms = await db["rooms"].delete_many({
                "active": False,
                "archivedAt": {"$lt": cutoff_date}
            })
            
            # Delete expired archived tenants
            tenants = await db["tenants"].delete_many({
                "archived": True,
                "archivedAt": {"$lt": cutoff_date}
            })
            
            logger.info(
                f"Cleanup completed: deleted {props.deleted_count} properties, "
                f"{rooms.deleted_count} rooms, {tenants.deleted_count} tenants"
            )
            
            return {
                "deleted_properties": props.deleted_count,
                "deleted_rooms": rooms.deleted_count,
                "deleted_tenants": tenants.deleted_count
            }
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
            return {"error": "Cleanup failed"}
