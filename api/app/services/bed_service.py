import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional
from bson.errors import InvalidId
from app.database.mongodb import db
from app.models.bed_schema import BedCreate, BedUpdate, BedOut
from bson import ObjectId

logger = logging.getLogger(__name__)

class BedService:
    def __init__(self):
        self.db = db

    async def create_bed(self, bed_data: BedCreate) -> BedOut:
        now = datetime.now(timezone.utc).isoformat()
        doc = bed_data.model_dump()
        doc["isDeleted"] = False
        doc["createdAt"] = now
        doc["updatedAt"] = now
        result = await self.db["beds"].insert_one(doc)
        doc["id"] = str(result.inserted_id)
        logger.info(
            "bed_created",
            extra={
                "event": "bed_created",
                "bed_id": doc["id"],
                "room_id": doc.get("roomId"),
                "property_id": doc.get("propertyId"),
            },
        )
        return BedOut(**doc)

    async def get_bed_by_id(self, bed_id: str) -> Optional[BedOut]:
        try:
            doc = await self.db["beds"].find_one({"_id": ObjectId(bed_id), "isDeleted": {"$ne": True}})
            if doc:
                doc["id"] = str(doc["_id"])
                return BedOut(**doc)
        except InvalidId:
            # Try by id field if not a valid ObjectId
            doc = await self.db["beds"].find_one({"id": bed_id, "isDeleted": {"$ne": True}})
            if doc:
                doc["id"] = str(doc.get("id"))
                return BedOut(**doc)
        return None

    async def update_bed(self, bed_id: str, bed_update: BedUpdate) -> Optional[BedOut]:
        update_data = bed_update.model_dump(exclude_unset=True)
        update_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        
        try:
            result = await self.db["beds"].find_one_and_update(
                {"_id": ObjectId(bed_id), "isDeleted": {"$ne": True}},
                {"$set": update_data},
                return_document=True
            )
        except InvalidId:
            # If ObjectId conversion fails, try by id field
            logger.warning("bed_update_invalid_object_id", extra={"event": "bed_update_invalid_object_id", "bed_id": bed_id})
            result = await self.db["beds"].find_one_and_update(
                {"id": bed_id, "isDeleted": {"$ne": True}},
                {"$set": update_data},
                return_document=True
            )

        if result:
            result["id"] = str(result.get("_id", result.get("id")))
            logger.info(
                "bed_updated",
                extra={
                    "event": "bed_updated",
                    "bed_id": result["id"],
                    "property_id": result.get("propertyId"),
                    "updated_fields": list(update_data.keys()),
                },
            )
            return BedOut(**result)
        
        return None

    async def delete_bed(self, bed_id: str) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = await self.db["beds"].update_one(
                {"_id": ObjectId(bed_id)},
                {"$set": {"isDeleted": True, "updatedAt": now}}
            )
            if result.modified_count > 0:
                logger.info("bed_deleted", extra={"event": "bed_deleted", "bed_id": bed_id})
                return True
        except InvalidId:
            result = await self.db["beds"].update_one(
                {"id": bed_id},
                {"$set": {"isDeleted": True, "updatedAt": now}}
            )
            if result.modified_count > 0:
                logger.info("bed_deleted", extra={"event": "bed_deleted", "bed_id": bed_id})
                return True
        return False

    async def list_beds_by_room(self, room_id: str) -> List[BedOut]:
        cursor = self.db["beds"].find({"roomId": room_id, "isDeleted": {"$ne": True}})
        beds = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            beds.append(BedOut(**doc))
        return beds

    async def list_beds_by_property(self, property_id: str) -> List[BedOut]:
        cursor = self.db["beds"].find({"propertyId": property_id, "isDeleted": {"$ne": True}})
        beds = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            beds.append(BedOut(**doc))
        return beds

    async def _get_beds_with_rooms(self, property_id: str, available_only: bool = False) -> List[dict]:
        """FIX: Helper to DRY up bed listing with room info (Low #27)"""
        match_query = {"propertyId": property_id, "isDeleted": {"$ne": True}}
        if available_only:
            match_query["status"] = "available"

        pipeline = [
            {"$match": match_query},
            {
                "$lookup": {
                    "from": "rooms",
                    "let": {"room_id": "$roomId"},
                    "pipeline": [
                        {"$match": {"$expr": {"$and": [
                            {"$eq": [{"$toString": "$_id"}, "$$room_id"]},
                            {"$ne": ["$isDeleted", True]}
                        ]}}}
                    ],
                    "as": "room"
                }
            },
            {"$unwind": "$room"},
            {
                "$project": {
                    "id": {"$toString": "$_id"},
                    "bedNumber": 1,
                    "status": 1,
                    "tenantId": 1,
                    "roomId": 1,
                    "propertyId": 1,
                    "room": {
                        "id": {"$toString": "$room._id"},
                        "roomNumber": 1,
                        "floor": 1
                    }
                }
            }
        ]
        
        result = await self.db["beds"].aggregate(pipeline).to_list(None)
        # Sort by room number
        result.sort(key=lambda x: x["room"]["roomNumber"])
        
        event_name = "beds_available_grouped" if available_only else "beds_all_grouped"
        logger.info(
            event_name,
            extra={"event": event_name, "property_id": property_id, "count": len(result)},
        )
        return result

    async def get_available_beds_with_rooms(self, property_id: str) -> List[dict]:
        """List available beds with associated room info"""
        return await self._get_beds_with_rooms(property_id, available_only=True)

    async def get_all_beds_with_rooms(self, property_id: str) -> List[dict]:
        """List all beds (available & occupied) with room info"""
        return await self._get_beds_with_rooms(property_id, available_only=False)
