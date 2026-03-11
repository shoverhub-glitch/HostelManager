
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from app.database.mongodb import db
from app.models.bed_schema import BedCreate, BedUpdate, BedOut

class BedService:
    def __init__(self):
        self.db = db

    async def create_bed(self, bed: BedCreate) -> BedOut:
        now = datetime.now(timezone.utc).isoformat()
        doc = bed.model_dump()
        doc["createdAt"] = now
        doc["updatedAt"] = now
        doc["id"] = str(uuid.uuid4())
        doc["isDeleted"] = False
        await self.db["beds"].insert_one(doc)
        return BedOut(**doc)

    async def get_bed(self, bed_id: str) -> Optional[BedOut]:
        from bson import ObjectId
        try:
            doc = await self.db["beds"].find_one({"_id": ObjectId(bed_id), "isDeleted": {"$ne": True}})
            if doc:
                doc["id"] = str(doc["_id"])
                return BedOut(**doc)
        except:
            # If ObjectId conversion fails, try looking by id field
            doc = await self.db["beds"].find_one({"id": bed_id, "isDeleted": {"$ne": True}})
            if doc:
                return BedOut(**doc)
        return None

    async def update_bed(self, bed_id: str, bed_update: BedUpdate) -> Optional[BedOut]:
        from bson import ObjectId
        update_data = {k: v for k, v in bed_update.model_dump(exclude_unset=True).items()}
        if not update_data:
            return await self.get_bed(bed_id)
        update_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        
        for protected_key in ["isDeleted"]:
            update_data.pop(protected_key, None)

        try:
            result = await self.db["beds"].find_one_and_update(
                {"_id": ObjectId(bed_id), "isDeleted": {"$ne": True}},
                {"$set": update_data},
                return_document=True
            )
            if result:
                result["id"] = str(result["_id"])
                return BedOut(**result)
        except:
            # If ObjectId conversion fails, try by id field
            result = await self.db["beds"].find_one_and_update(
                {"id": bed_id, "isDeleted": {"$ne": True}},
                {"$set": update_data},
                return_document=True
            )
            if result:
                return BedOut(**result)
        return None

    async def delete_bed(self, bed_id: str) -> bool:
        from bson import ObjectId
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = await self.db["beds"].update_one(
                {"_id": ObjectId(bed_id), "isDeleted": {"$ne": True}},
                {"$set": {"isDeleted": True, "updatedAt": now}}
            )
            return result.modified_count == 1
        except:
            # If ObjectId conversion fails, try by id field
            result = await self.db["beds"].update_one(
                {"id": bed_id, "isDeleted": {"$ne": True}},
                {"$set": {"isDeleted": True, "updatedAt": now}}
            )
            return result.modified_count == 1

    async def get_available_beds_with_rooms(self, property_id: str) -> List[dict]:
        """Get all available beds for a property, grouped by rooms with room information"""
        # Get all available beds for the property
        beds_cursor = self.db["beds"].find({
            "propertyId": property_id,
            "status": "available",
            "isDeleted": {"$ne": True}
        })
        beds = []
        async for doc in beds_cursor:
            beds.append(doc)
        
        if not beds:
            return []
        
        # Get unique room IDs
        room_ids = list(set(bed["roomId"] for bed in beds))
        
        # Convert room IDs (hex strings) back to ObjectId for querying
        from bson import ObjectId
        object_ids = []
        for room_id in room_ids:
            try:
                object_ids.append(ObjectId(room_id))
            except:
                # If conversion fails, skip this room ID
                pass
        
        if not object_ids:
            return []
        
        # Fetch room details by _id or include rooms where active is true OR active field doesn't exist
        rooms_cursor = self.db["rooms"].find({
            "_id": {"$in": object_ids},
            "isDeleted": {"$ne": True},
            "$or": [
                {"active": True},
                {"active": {"$exists": False}}
            ]
        })
        rooms_dict = {}
        async for room_doc in rooms_cursor:
            room_id = str(room_doc["_id"])
            rooms_dict[room_id] = {
                "id": room_id,
                "roomNumber": room_doc["roomNumber"],
                "floor": room_doc["floor"],
                "price": room_doc["price"],
            }
        
        # Group beds by room
        result = []
        beds_by_room = {}
        for bed in beds:
            room_id = bed["roomId"]
            if room_id not in beds_by_room:
                beds_by_room[room_id] = []
            beds_by_room[room_id].append({
                "id": bed["id"],
                "bedNumber": bed["bedNumber"],
                "status": bed["status"],
            })
        
        # Build response with room info and available beds
        for room_id, room_beds in beds_by_room.items():
            if room_id in rooms_dict:
                result.append({
                    "room": rooms_dict[room_id],
                    "availableBeds": room_beds
                })
        
        # Sort by room number
        result.sort(key=lambda x: x["room"]["roomNumber"])
        return result

    async def get_all_beds_with_rooms(self, property_id: str) -> List[dict]:
        """Get ALL beds (available, occupied, maintenance) for a property, grouped by rooms with room information"""
        # Get all beds for the property (no status filter)
        beds_cursor = self.db["beds"].find({
            "propertyId": property_id,
            "isDeleted": {"$ne": True}
        })
        beds = []
        async for doc in beds_cursor:
            beds.append(doc)
        
        if not beds:
            return []
        
        # Get unique room IDs
        room_ids = list(set(bed["roomId"] for bed in beds))
        
        # Convert room IDs (hex strings) back to ObjectId for querying
        from bson import ObjectId
        object_ids = []
        for room_id in room_ids:
            try:
                object_ids.append(ObjectId(room_id))
            except:
                # If conversion fails, skip this room ID
                pass
        
        if not object_ids:
            return []
        
        # Fetch room details by _id or include rooms where active is true OR active field doesn't exist
        rooms_cursor = self.db["rooms"].find({
            "_id": {"$in": object_ids},
            "isDeleted": {"$ne": True},
            "$or": [
                {"active": True},
                {"active": {"$exists": False}}
            ]
        })
        rooms_dict = {}
        async for room_doc in rooms_cursor:
            room_id = str(room_doc["_id"])
            rooms_dict[room_id] = {
                "id": room_id,
                "roomNumber": room_doc["roomNumber"],
                "floor": room_doc["floor"],
                "price": room_doc["price"],
            }
        
        # Group beds by room
        result = []
        beds_by_room = {}
        for bed in beds:
            room_id = bed["roomId"]
            if room_id not in beds_by_room:
                beds_by_room[room_id] = []
            beds_by_room[room_id].append({
                "id": str(bed.get("_id", bed.get("id"))),
                "bedNumber": bed["bedNumber"],
                "status": bed["status"],
                "roomId": bed["roomId"],
            })
        
        # Build response with room info and all beds
        for room_id, room_beds in beds_by_room.items():
            if room_id in rooms_dict:
                result.append({
                    "room": rooms_dict[room_id],
                    "availableBeds": room_beds
                })
        
        # Sort by room number
        result.sort(key=lambda x: x["room"]["roomNumber"])
        return result
