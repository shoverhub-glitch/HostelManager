from typing import List, Optional
from datetime import datetime, timezone
from bson import ObjectId
from ..models.payment_schema import Payment, PaymentCreate, PaymentStatus
from app.database.mongodb import getCollection

class PaymentService:
    def __init__(self):
        self.collection = getCollection("payments")

    async def get_payment_by_id(self, payment_id: str) -> Optional[Payment]:
        payment = await self.collection.find_one({"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}})
        if payment:
            payment["id"] = str(payment["_id"])
            return Payment(**payment)
        return None

    async def create_payment(self, payment_data: PaymentCreate) -> Payment:
        from pymongo.errors import DuplicateKeyError
        
        now = datetime.now(timezone.utc)
        payment_dict = payment_data.model_dump()
        
        # Convert date object to ISO string for MongoDB storage
        if payment_dict.get("dueDate") and hasattr(payment_dict["dueDate"], 'isoformat'):
            payment_dict["dueDate"] = payment_dict["dueDate"].isoformat()
        
        # Auto-set paidDate when status is "paid" and paidDate is not provided
        if payment_dict.get("status") == "paid" and not payment_dict.get("paidDate"):
            payment_dict["paidDate"] = now.date().isoformat()
        
        payment_dict["isDeleted"] = False
        payment_dict["createdAt"] = now
        payment_dict["updatedAt"] = now
        
        try:
            result = await self.collection.insert_one(payment_dict)
            payment_dict["id"] = str(result.inserted_id)
            return Payment(**payment_dict)
        except DuplicateKeyError:
            # Payment already exists for this tenant on this due date
            # Return existing payment instead of raising error
            existing = await self.collection.find_one({
                "tenantId": payment_dict.get("tenantId"),
                "dueDate": payment_dict.get("dueDate"),
                "isDeleted": {"$ne": True}
            })
            if existing:
                existing["id"] = str(existing["_id"])
                return Payment(**existing)
            raise

    async def get_payment_stats(self):
        payments = await self.collection.find({"isDeleted": {"$ne": True}}).to_list(length=1000)
        
        def parse_amount(amount_str):
            """Parse amount string that may contain currency symbols and commas"""
            if not amount_str:
                return 0.0
            try:
                # Remove currency symbols and commas, then convert to float
                cleaned = str(amount_str).replace('₹', '').replace(',', '').strip()
                return float(cleaned) if cleaned else 0.0
            except (ValueError, TypeError):
                return 0.0
        
        collected = sum(
            parse_amount(p["amount"])
            for p in payments if p["status"] == PaymentStatus.PAID.value
        )
        pending = sum(
            parse_amount(p["amount"])
            for p in payments if p["status"] == PaymentStatus.DUE.value
        )
        return {
            'collected': f'₹{collected:,.0f}',
            'pending': f'₹{pending:,.0f}',
        }

    async def update_payment(self, payment_id: str, payment_update) -> Optional[Payment]:
        from datetime import date as date_type
        
        payment = await self.collection.find_one({"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}})
        if not payment:
            return None
        update_data = {k: v for k, v in payment_update.model_dump().items() if v is not None}
        
        # Auto-set paidDate when status changes to "paid" and paidDate is not provided
        # This handles the case where user changes status to paid but hasn't edited the date
        if update_data.get("status") == "paid" and "paidDate" not in update_data:
            # Only auto-set if there's no existing paidDate or user is changing status
            if not payment.get("paidDate"):
                update_data["paidDate"] = date_type.today().isoformat()
        
        # If status is changing from paid to due, keep the paidDate as reference
        # User can edit it if needed
        
        # Convert date objects to ISO string for MongoDB storage
        if update_data.get("dueDate") and hasattr(update_data["dueDate"], 'isoformat'):
            update_data["dueDate"] = update_data["dueDate"].isoformat()
        if update_data.get("paidDate") and hasattr(update_data["paidDate"], 'isoformat'):
            update_data["paidDate"] = update_data["paidDate"].isoformat()
        
        for protected_key in ["isDeleted"]:
            update_data.pop(protected_key, None)

        update_data["updatedAt"] = datetime.now(timezone.utc)
        await self.collection.update_one({"_id": ObjectId(payment_id)}, {"$set": update_data})
        payment.update(update_data)
        payment["id"] = str(payment["_id"])
        return Payment(**payment)

    async def delete_payment(self, payment_id: str) -> bool:
        """Delete a single payment by ID"""
        now = datetime.now(timezone.utc).isoformat()
        result = await self.collection.update_one(
            {"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}},
            {"$set": {"isDeleted": True, "updatedAt": now}}
        )
        return result.modified_count > 0

    async def delete_payments_by_tenant(self, tenant_id: str) -> int:
        """Delete all payments for a specific tenant. Returns count of deleted payments."""
        now = datetime.now(timezone.utc).isoformat()
        result = await self.collection.update_many(
            {"tenantId": tenant_id, "isDeleted": {"$ne": True}},
            {"$set": {"isDeleted": True, "updatedAt": now}}
        )
        return result.modified_count