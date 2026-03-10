from app.models.staff_schema import Staff, StaffOut, StaffCreate, StaffUpdate
from app.database.mongodb import getCollection
from datetime import datetime, timezone
from bson import ObjectId


class StaffService:
    def __init__(self):
        self.collection = getCollection("staff")

    async def get_staff_list(
        self,
        property_id: str = None,
        search: str = None,
        role: str = None,
        skip: int = 0,
        limit: int = 50,
    ):
        """Get list of staff with optional filtering"""
        query = {}
        
        if property_id:
            query["propertyId"] = property_id
        
        if search:
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"mobileNumber": {"$regex": search, "$options": "i"}},
                {"address": {"$regex": search, "$options": "i"}},
            ]
        
        if role:
            query["role"] = role

        # Filter out archived by default
        query["archived"] = False

        total = await self.collection.count_documents(query)

        staff_list = await self.collection.find(query).skip(skip).limit(limit).sort(
            "_id", -1
        ).to_list(length=limit)

        return [
            self._convert_to_out(staff) for staff in staff_list
        ], total

    async def get_staff(self, staff_id: str) -> StaffOut:
        """Get single staff by ID"""
        try:
            staff = await self.collection.find_one({"_id": ObjectId(staff_id)})
            return self._convert_to_out(staff) if staff else None
        except Exception:
            return None

    async def create_staff(self, staff_data: dict) -> StaffOut:
        """Create new staff member"""
        staff_data["createdAt"] = datetime.now(timezone.utc).isoformat()
        staff_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        staff_data["archived"] = False

        result = await self.collection.insert_one(staff_data)
        created_staff = await self.collection.find_one({"_id": result.inserted_id})
        return self._convert_to_out(created_staff)

    async def update_staff(self, staff_id: str, staff_data: dict) -> StaffOut:
        """Update staff member"""
        staff_data["updatedAt"] = datetime.now(timezone.utc).isoformat()

        try:
            result = await self.collection.find_one_and_update(
                {"_id": ObjectId(staff_id)},
                {"$set": staff_data},
                return_document=True,
            )
            return self._convert_to_out(result) if result else None
        except Exception:
            return None

    async def delete_staff(self, staff_id: str) -> bool:
        """Delete staff member (soft delete by archiving)"""
        try:
            update_data = {
                "archived": True,
                "archivedAt": datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
            result = await self.collection.update_one(
                {"_id": ObjectId(staff_id)}, {"$set": update_data}
            )
            return result.modified_count > 0
        except Exception:
            return False

    async def restore_staff(self, staff_id: str) -> StaffOut:
        """Restore archived staff member"""
        try:
            update_data = {
                "archived": False,
                "archivedReason": None,
                "archivedAt": None,
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            }
            result = await self.collection.find_one_and_update(
                {"_id": ObjectId(staff_id)}, {"$set": update_data}, return_document=True
            )
            return self._convert_to_out(result) if result else None
        except Exception:
            return None

    async def get_archived_staff(
        self, property_id: str = None, skip: int = 0, limit: int = 50
    ):
        """Get archived staff"""
        query = {"archived": True}
        if property_id:
            query["propertyId"] = property_id

        total = await self.collection.count_documents(query)
        staff_list = await self.collection.find(query).skip(skip).limit(limit).sort(
            "archivedAt", -1
        ).to_list(length=limit)

        return [
            self._convert_to_out(staff) for staff in staff_list
        ], total

    def _convert_to_out(self, staff_doc) -> StaffOut:
        """Convert MongoDB document to StaffOut model"""
        if not staff_doc:
            return None

        return StaffOut(
            id=str(staff_doc.get("_id")),
            propertyId=staff_doc.get("propertyId"),
            name=staff_doc.get("name"),
            role=staff_doc.get("role"),
            mobileNumber=staff_doc.get("mobileNumber"),
            address=staff_doc.get("address"),
            status=staff_doc.get("status", "active"),
            joiningDate=staff_doc.get("joiningDate"),
            salary=staff_doc.get("salary"),
            emergencyContact=staff_doc.get("emergencyContact"),
            emergencyContactNumber=staff_doc.get("emergencyContactNumber"),
            notes=staff_doc.get("notes"),
            createdAt=staff_doc.get("createdAt"),
            updatedAt=staff_doc.get("updatedAt"),
            archived=staff_doc.get("archived", False),
            archivedReason=staff_doc.get("archivedReason"),
            archivedAt=staff_doc.get("archivedAt"),
        )
