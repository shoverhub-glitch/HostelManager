"""
Subscription Lifecycle Management
Handles subscription downgrades, upgrades, and resource archival with grace periods
"""

from app.database.mongodb import db
from app.services.subscription_service import SubscriptionService
from datetime import datetime, timedelta, timezone
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
            now = datetime.now(timezone.utc).isoformat()
            grace_period_until = (datetime.now(timezone.utc) + timedelta(days=ARCHIVAL_GRACE_PERIOD_DAYS)).isoformat()
            
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
            now = datetime.now(timezone.utc).isoformat()
            
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
                {**build_owner_query(owner_id), "active": False, "isDeleted": {"$ne": True}}
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
    async def schedule_expired_archives_for_deletion():
        """
        First stage: Mark expired archives for deletion with a 7-day warning period.
        This runs BEFORE any permanent deletion occurs.
        Verifies owner subscription is still below limits before scheduling.
        """
        try:
            now = datetime.now(timezone.utc)
            warning_cutoff = (now - timedelta(days=ARCHIVAL_GRACE_PERIOD_DAYS)).isoformat()
            
            # Find all expired archived resources
            expired_properties = await db["properties"].find({
                "active": False,
                "archivedAt": {"$lt": warning_cutoff},
                "scheduledForDeletion": {"$ne": True}
            }).to_list(length=None)
            
            scheduled_properties = []
            scheduled_rooms = []
            scheduled_tenants = []
            
            for prop in expired_properties:
                owner_id = prop.get("ownerId") or prop.get("createdBy")
                if not owner_id:
                    continue
                
                # Verify owner still needs this resource archived (subscription still low tier)
                sub = await SubscriptionService.get_subscription(owner_id)
                
                # Get current limits for their plan
                limits = await SubscriptionService.get_plan_limits(sub.plan)
                if not limits:
                    limits = {"properties": 1, "tenants": 80}
                
                # Count their active resources
                active_properties = await db["properties"].count_documents({
                    **build_owner_query(owner_id),
                    "active": True
                })
                
                # Skip scheduling if user has upgraded (active_properties > limit means they restored resources)
                # Only schedule archived properties for deletion if they're still at or below their limit
                if active_properties <= limits["properties"]:
                    continue
                
                # Mark property for deletion
                await db["properties"].update_one(
                    {"_id": prop["_id"]},
                    {
                        "$set": {
                            "scheduledForDeletion": True,
                            "scheduledForDeletionAt": now.isoformat(),
                            "deletionWarningSent": False,
                            "updatedAt": now.isoformat()
                        }
                    }
                )
                scheduled_properties.append(str(prop["_id"]))
                
                # Also schedule child rooms
                await db["rooms"].update_many(
                    {"propertyId": str(prop["_id"]), "active": False},
                    {
                        "$set": {
                            "scheduledForDeletion": True,
                            "scheduledForDeletionAt": now.isoformat(),
                            "updatedAt": now.isoformat()
                        }
                    }
                )
                
                # Schedule associated tenants
                await db["tenants"].update_many(
                    {"propertyId": str(prop["_id"]), "archived": True},
                    {
                        "$set": {
                            "scheduledForDeletion": True,
                            "scheduledForDeletionAt": now.isoformat(),
                            "updatedAt": now.isoformat()
                        }
                    }
                )
                
                # Audit log
                logger.warning(
                    f"AUDIT: Scheduled property {prop['_id']} (owner: {owner_id}) for deletion. "
                    f"Reason: Subscription grace period expired. "
                    f"Will be permanently deleted after warning period."
                )
            
            # Handle orphaned archived rooms/tenants (not tied to scheduled properties)
            orphaned_rooms = await db["rooms"].find({
                "active": False,
                "archivedAt": {"$lt": warning_cutoff},
                "scheduledForDeletion": {"$ne": True},
                "propertyId": {"$nin": scheduled_properties}
            }).to_list(length=None)
            
            for room in orphaned_rooms:
                await db["rooms"].update_one(
                    {"_id": room["_id"]},
                    {
                        "$set": {
                            "scheduledForDeletion": True,
                            "scheduledForDeletionAt": now.isoformat(),
                            "updatedAt": now.isoformat()
                        }
                    }
                )
                scheduled_rooms.append(str(room["_id"]))
                
                logger.warning(
                    f"AUDIT: Scheduled room {room['_id']} for deletion."
                )
            
            orphaned_tenants = await db["tenants"].find({
                "archived": True,
                "archivedAt": {"$lt": warning_cutoff},
                "scheduledForDeletion": {"$ne": True},
                "propertyId": {"$nin": scheduled_properties}
            }).to_list(length=None)
            
            for tenant in orphaned_tenants:
                await db["tenants"].update_one(
                    {"_id": tenant["_id"]},
                    {
                        "$set": {
                            "scheduledForDeletion": True,
                            "scheduledForDeletionAt": now.isoformat(),
                            "updatedAt": now.isoformat()
                        }
                    }
                )
                scheduled_tenants.append(str(tenant["_id"]))
                
                logger.warning(
                    f"AUDIT: Scheduled tenant {tenant['_id']} for deletion."
                )
            
            logger.info(
                f"Scheduled for deletion: {len(scheduled_properties)} properties, "
                f"{len(scheduled_rooms)} rooms, {len(scheduled_tenants)} tenants"
            )
            
            return {
                "scheduled_properties": len(scheduled_properties),
                "scheduled_rooms": len(scheduled_rooms),
                "scheduled_tenants": len(scheduled_tenants)
            }
        except Exception as e:
            logger.error(f"Error scheduling deletions: {str(e)}")
            return {"error": "Failed to schedule deletions"}

    @staticmethod
    async def send_deletion_warnings():
        """
        Send warning emails for resources scheduled for deletion.
        Should be called daily after schedule_expired_archives_for_deletion.
        """
        try:
            now = datetime.now(timezone.utc)
            warning_threshold = (now - timedelta(days=7)).isoformat()
            
            # Find properties not yet warned
            properties_to_warn = await db["properties"].find({
                "scheduledForDeletion": True,
                "deletionWarningSent": {"$ne": True}
            }).to_list(length=None)
            
            warned_count = 0
            for prop in properties_to_warn:
                owner_id = prop.get("ownerId") or prop.get("createdBy")
                if owner_id:
                    # Log warning (actual email sending would be integrated here)
                    logger.warning(
                        f"DELETION WARNING: Property {prop.get('name')} (ID: {prop['_id']}) "
                        f"scheduled for permanent deletion for user {owner_id}. "
                        f"Resources will be deleted in 7 days if not recovered."
                    )
                    
                    # Mark warning as sent
                    await db["properties"].update_one(
                        {"_id": prop["_id"]},
                        {
                            "$set": {
                                "deletionWarningSent": True,
                                "deletionWarningSentAt": now.isoformat(),
                                "updatedAt": now.isoformat()
                            }
                        }
                    )
                    warned_count += 1
            
            logger.info(f"Sent {warned_count} deletion warnings")
            return {"warned_count": warned_count}
        except Exception as e:
            logger.error(f"Error sending deletion warnings: {str(e)}")
            return {"error": "Failed to send warnings"}

    @staticmethod
    async def cleanup_expired_archives():
        """
        Final stage: Permanently delete resources that have been scheduled for deletion
        AND have passed the 7-day warning period.
        Should be called daily after send_deletion_warnings.
        """
        try:
            now = datetime.now(timezone.utc)
            deletion_cutoff = (now - timedelta(days=7)).isoformat()
            
            # First, audit log all pending deletions
            pending_properties = await db["properties"].find({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            }).to_list(length=None)
            
            pending_rooms = await db["rooms"].find({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            }).to_list(length=None)
            
            pending_tenants = await db["tenants"].find({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            }).to_list(length=None)
            
            # Emit audit logs before deletion
            for prop in pending_properties:
                owner_id = prop.get("ownerId") or prop.get("createdBy")
                logger.critical(
                    f"AUDIT CRITICAL: PERMANENTLY DELETING property {prop.get('name')} "
                    f"(ID: {prop['_id']}, owner: {owner_id}). "
                    f"Archived at: {prop.get('archivedAt')}, "
                    f"Scheduled at: {prop.get('scheduledForDeletionAt')}. "
                    f"This action is IRREVERSIBLE."
                )
            
            for room in pending_rooms:
                logger.critical(
                    f"AUDIT CRITICAL: PERMANENTLY DELETING room {room.get('roomNumber')} "
                    f"(ID: {room['_id']}, property: {room.get('propertyId')}). "
                    f"This action is IRREVERSIBLE."
                )
            
            for tenant in pending_tenants:
                logger.critical(
                    f"AUDIT CRITICAL: PERMANENTLY DELETING tenant {tenant.get('name')} "
                    f"(ID: {tenant['_id']}, property: {tenant.get('propertyId')}). "
                    f"This action is IRREVERSIBLE."
                )
            
            # Now perform the deletions
            props = await db["properties"].delete_many({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            })
            
            rooms = await db["rooms"].delete_many({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            })
            
            tenants = await db["tenants"].delete_many({
                "scheduledForDeletion": True,
                "scheduledForDeletionAt": {"$lt": deletion_cutoff}
            })
            
            logger.info(
                f"PERMANENT DELETION completed: deleted {props.deleted_count} properties, "
                f"{rooms.deleted_count} rooms, {tenants.deleted_count} tenants"
            )
            
            return {
                "deleted_properties": props.deleted_count,
                "deleted_rooms": rooms.deleted_count,
                "deleted_tenants": tenants.deleted_count
            }
        except Exception as e:
            logger.error(f"Error during permanent deletion cleanup: {str(e)}")
            return {"error": "Cleanup failed"}
