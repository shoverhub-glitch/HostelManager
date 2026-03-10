from app.models.room_schema import Room
from app.database.mongodb import getCollection
from datetime import datetime,timezone
from bson import ObjectId
from app.services.bed_service import BedService
from app.models.bed_schema import BedCreate


bed_service = BedService()
class RoomService:

    def __init__(self):
        self.collection = getCollection("rooms")

    async def get_rooms(self, property_id: str = None):
        query = {}
        if property_id:
            query["propertyId"] = property_id
        cursor = self.collection.find(query)
        rooms = []
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            rooms.append(Room(**doc))
        return rooms

    async def get_room(self, room_id: str):
        doc = await self.collection.find_one({"_id": ObjectId(room_id)})
        if doc:
            doc["id"] = str(doc["_id"])
            return Room(**doc)
        return None

    async def create_room(self, room_data: dict):
        now = datetime.now(timezone.utc).isoformat()
        if not room_data.get("createdAt"):
            room_data["createdAt"] = now
        if not room_data.get("updatedAt"):
            room_data["updatedAt"] = now
        # Ensure active is set to True (default for new rooms)
        if "active" not in room_data:
            room_data["active"] = True
        
        # Check if room number already exists for this property
        existing = await self.collection.find_one({
            "propertyId": room_data["propertyId"],
            "roomNumber": room_data["roomNumber"]
        })
        if existing:
            raise ValueError(f"Room number '{room_data['roomNumber']}' already exists for this property")
        
        result = await self.collection.insert_one(room_data)
        room_data["id"] = str(result.inserted_id)
        # Auto-create beds for this room
        number_of_beds = room_data.get("numberOfBeds", 0)
        property_id = room_data["propertyId"]
        room_id = room_data["id"]
        for i in range(1, number_of_beds + 1):
            bed = BedCreate(
                propertyId=property_id,
                roomId=room_id,
                bedNumber=str(i),
                status="available",
                ownerId=room_data.get("ownerId")
            )
            await bed_service.create_bed(bed)
        return Room(**room_data)

    async def update_room(self, room_id: str, room_data: dict):
        from bson import ObjectId
        room_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        
        # If roomNumber is being updated, check for duplicates
        if "roomNumber" in room_data:
            existing = await self.collection.find_one({
                "propertyId": room_data["propertyId"],
                "roomNumber": room_data["roomNumber"],
                "_id": {"$ne": ObjectId(room_id)}
            })
            if existing:
                raise ValueError(f"Room number '{room_data['roomNumber']}' already exists for this property")
        
        # Handle bed count changes
        if "numberOfBeds" in room_data:
            await self._handle_bed_count_change(room_id, room_data)
        
        await self.collection.update_one({"_id": ObjectId(room_id)}, {"$set": room_data})
        doc = await self.collection.find_one({"_id": ObjectId(room_id)})
        if doc:
            doc["id"] = str(doc["_id"])
            return Room(**doc)
        return None
    
    async def _handle_bed_count_change(self, room_id: str, room_data: dict):
        """Handle changes in number of beds - relocate or vacate tenants as needed"""
        beds_collection = getCollection("beds")
        tenants_collection = getCollection("tenants")
        
        # Get current room to compare
        current_room = await self.collection.find_one({"_id": ObjectId(room_id)})
        if not current_room:
            return
        
        current_bed_count = current_room.get("numberOfBeds", 0)
        new_bed_count = room_data.get("numberOfBeds", 0)
        property_id = room_data.get("propertyId") or current_room.get("propertyId")
        
        if new_bed_count < current_bed_count:
            # Reducing beds - handle affected tenants
            # Get beds that will be removed (bed numbers > new_bed_count)
            beds_to_remove = await beds_collection.find({
                "roomId": room_id,
                "bedNumber": {"$gt": str(new_bed_count)}
            }).to_list(None)
            
            for bed in beds_to_remove:
                tenant_id = bed.get("tenantId")
                if tenant_id:
                    # First, try to find an available bed in the SAME ROOM
                    available_bed = await beds_collection.find_one({
                        "roomId": room_id,
                        "status": "available",
                        "bedNumber": {"$lte": str(new_bed_count)},
                        "_id": {"$ne": bed["_id"]}
                    })
                    
                    # If no available bed in same room, try same property
                    if not available_bed:
                        available_bed = await beds_collection.find_one({
                            "propertyId": property_id,
                            "roomId": {"$ne": room_id},
                            "status": "available",
                            "_id": {"$ne": bed["_id"]}
                        })
                    
                    if available_bed:
                        # Move tenant to available bed
                        await beds_collection.update_one(
                            {"_id": available_bed["_id"]},
                            {
                                "$set": {
                                    "status": "occupied",
                                    "tenantId": tenant_id,
                                    "updatedAt": datetime.now(timezone.utc).isoformat()
                                }
                            }
                        )
                        # Update tenant's bedId and roomId if relocated to different room
                        update_data = {
                            "bedId": str(available_bed["_id"]),
                            "updatedAt": datetime.now(timezone.utc).isoformat()
                        }
                        if str(available_bed.get("roomId")) != room_id:
                            update_data["roomId"] = str(available_bed["roomId"])
                        
                        await tenants_collection.update_one(
                            {"_id": ObjectId(tenant_id)},
                            {"$set": update_data}
                        )
                    else:
                        # No available bed - mark tenant as vacated
                        await tenants_collection.update_one(
                            {"_id": ObjectId(tenant_id)},
                            {
                                "$set": {
                                    "tenantStatus": "vacated",
                                    "checkoutDate": datetime.now(timezone.utc).isoformat(),
                                    "billingConfig": None,
                                    "updatedAt": datetime.now(timezone.utc).isoformat()
                                }
                            }
                        )
                
                # Delete the bed
                await beds_collection.delete_one({"_id": bed["_id"]})
        
        elif new_bed_count > current_bed_count:
            # Increasing beds - create new beds
            owner_id = current_room.get("ownerId")
            for i in range(current_bed_count + 1, new_bed_count + 1):
                bed = BedCreate(
                    propertyId=property_id,
                    roomId=room_id,
                    bedNumber=str(i),
                    status="available",
                    ownerId=owner_id
                )
                await bed_service.create_bed(bed)
    
    async def preview_bed_count_change(self, room_id: str, new_bed_count: int):
        """Preview what will happen if bed count is changed"""
        beds_collection = getCollection("beds")
        tenants_collection = getCollection("tenants")
        
        current_room = await self.collection.find_one({"_id": ObjectId(room_id)})
        if not current_room:
            return None
        
        current_bed_count = current_room.get("numberOfBeds", 0)
        property_id = current_room.get("propertyId")
        
        result = {
            "currentBedCount": current_bed_count,
            "newBedCount": new_bed_count,
            "affectedTenants": [],
            "availableBedsInProperty": 0
        }
        
        if new_bed_count < current_bed_count:
            # Count available beds in same room first
            available_beds_same_room = await beds_collection.count_documents({
                "roomId": room_id,
                "status": "available",
                "bedNumber": {"$lte": str(new_bed_count)}
            })
            
            # Count available beds in other rooms of same property
            available_beds_other_rooms = await beds_collection.count_documents({
                "propertyId": property_id,
                "status": "available",
                "roomId": {"$ne": room_id}
            })
            
            result["availableBedsInSameRoom"] = available_beds_same_room
            result["availableBedsInProperty"] = available_beds_other_rooms
            
            # Get beds that will be removed
            beds_to_remove = await beds_collection.find({
                "roomId": room_id,
                "bedNumber": {"$gt": str(new_bed_count)}
            }).to_list(None)
            
            available_same_room_index = 0
            available_other_room_index = 0
            
            for bed in beds_to_remove:
                tenant_id = bed.get("tenantId")
                if tenant_id:
                    tenant = await tenants_collection.find_one({"_id": ObjectId(tenant_id)})
                    if tenant:
                        # Determine action: try same room first, then other rooms
                        will_relocate_same_room = available_same_room_index < available_beds_same_room
                        will_relocate_other_room = not will_relocate_same_room and available_other_room_index < available_beds_other_rooms
                        
                        action = "vacate"
                        location = None
                        
                        if will_relocate_same_room:
                            action = "relocate"
                            location = "same_room"
                            available_same_room_index += 1
                        elif will_relocate_other_room:
                            action = "relocate"
                            location = "other_room"
                            available_other_room_index += 1
                        
                        result["affectedTenants"].append({
                            "id": str(tenant["_id"]),
                            "name": tenant.get("name"),
                            "bedNumber": bed.get("bedNumber"),
                            "action": action,
                            "location": location
                        })
        
        return result

    async def delete_room(self, room_id: str):
        # Find all beds in this room
        beds_collection = getCollection("beds")
        tenants_collection = getCollection("tenants")
        
        beds_cursor = beds_collection.find({"roomId": room_id})
        beds = await beds_cursor.to_list(None)
        
        # For each bed, update associated tenant to "vacated" status
        for bed in beds:
            bed_id = str(bed["_id"])
            tenant_id = bed.get("tenantId")
            
            if tenant_id:
                # Update tenant to vacated status
                await tenants_collection.update_one(
                    {"_id": ObjectId(tenant_id)},
                    {
                        "$set": {
                            "tenantStatus": "vacated",
                            "checkoutDate": datetime.now(timezone.utc).isoformat(),
                            "billingConfig": None,
                            "updatedAt": datetime.now(timezone.utc).isoformat()
                        }
                    }
                )
            
            # Set bed to available and clear tenantId
            await beds_collection.update_one(
                {"_id": bed["_id"]},
                {
                    "$set": {
                        "status": "available",
                        "tenantId": None,
                        "updatedAt": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        
        # Delete the room
        await self.collection.delete_one({"_id": ObjectId(room_id)})
        return {"success": True, "roomId": room_id}
