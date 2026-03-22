from typing import List, Optional, Union
from datetime import datetime, timezone
from bson import ObjectId
from ..models.payment_schema import Payment, PaymentCreate, PaymentStatus, format_amount_paise, parse_amount_to_paise
from app.database.mongodb import getCollection
import logging


logger = logging.getLogger(__name__)

class PaymentService:
    def __init__(self):
        self.collection = getCollection("payments")

    async def get_payment_by_id(self, payment_id: str) -> Optional[Payment]:
        try:
            payment = await self.collection.find_one({"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}})
        except Exception as e:
            logger.warning("payment_get_invalid_id", extra={"event": "payment_get_invalid_id", "payment_id": payment_id, "error": str(e)})
            return None
        if payment:
            payment["id"] = str(payment["_id"])
            return Payment(**payment)
        return None

    async def create_payment(self, payment_data: PaymentCreate) -> Payment:
        from pymongo.errors import DuplicateKeyError
        
        now = datetime.now(timezone.utc)
        payment_dict = payment_data.model_dump()
        
        # Convert amount to integer paise for storage
        payment_dict["amountPaise"] = parse_amount_to_paise(payment_dict.get("amount", 0))
        
        # Convert date object to ISO string for MongoDB storage
        if payment_dict.get("dueDate") and hasattr(payment_dict["dueDate"], 'isoformat'):
            payment_dict["dueDate"] = payment_dict["dueDate"].isoformat()
        
        # Auto-set paidDate when status is "paid" and paidDate is not provided
        if payment_dict.get("status") == "paid" and not payment_dict.get("paidDate"):
            payment_dict["paidDate"] = now.date().isoformat()
        
        payment_dict["isDeleted"] = False
        payment_dict["createdAt"] = now
        payment_dict["updatedAt"] = now
        
        # Remove the string amount - we store paise only
        payment_dict.pop("amount", None)
        
        try:
            result = await self.collection.insert_one(payment_dict)
            payment_dict["id"] = str(result.inserted_id)
            # Format amount for response
            payment_dict["amount"] = format_amount_paise(payment_dict["amountPaise"])
            payment_dict.pop("amountPaise", None)
            logger.info(
                "payment_created",
                extra={
                    "event": "payment_created",
                    "payment_id": payment_dict["id"],
                    "tenant_id": payment_dict.get("tenantId"),
                    "property_id": payment_dict.get("propertyId"),
                    "status": payment_dict.get("status"),
                },
            )
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
                # Format amount for response
                existing["amount"] = format_amount_paise(existing.get("amountPaise", existing.get("amount", 0)))
                existing.pop("amountPaise", None)
                logger.info(
                    "payment_create_duplicate_return_existing",
                    extra={
                        "event": "payment_create_duplicate_return_existing",
                        "tenant_id": payment_dict.get("tenantId"),
                        "property_id": payment_dict.get("propertyId"),
                        "due_date": payment_dict.get("dueDate"),
                    },
                )
                return Payment(**existing)
            raise

    async def get_payment_stats(self, property_ids: Optional[List[str]] = None):
        query = {"isDeleted": {"$ne": True}}

        if property_ids is not None:
            if not property_ids:
                return {
                    'collected': '₹0',
                    'pending': '₹0',
                }
            query["propertyId"] = {"$in": property_ids}

        # Fetch payments and aggregate in Python for backward compatibility
        payments = await self.collection.find(query, {"status": 1, "amount": 1, "amountPaise": 1, "_id": 0}).to_list(length=None)
        
        collected = 0
        pending = 0
        for p in payments:
            # Handle new format (amountPaise) and legacy format (amount as string)
            amount_paise = p.get("amountPaise")
            if amount_paise is None:
                # Legacy: parse string amount to paise
                amount_str = p.get("amount", "0")
                amount_paise = parse_amount_to_paise(amount_str)
            
            if p["status"] == PaymentStatus.PAID.value:
                collected += amount_paise
            elif p["status"] == PaymentStatus.DUE.value:
                pending += amount_paise
        
        stats = {
            'collected': format_amount_paise(collected),
            'pending': format_amount_paise(pending),
        }
        logger.info(
            "payment_stats_computed",
            extra={
                "event": "payment_stats_computed",
                "payments_count": len(payments),
                "scoped_properties": len(property_ids) if property_ids is not None else None,
            },
        )
        return stats

    async def update_payment(self, payment_id: str, payment_update) -> Optional[Payment]:
        from datetime import date as date_type
        
        try:
            payment = await self.collection.find_one({"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}})
        except Exception as e:
            logger.warning("payment_update_invalid_id", extra={"event": "payment_update_invalid_id", "payment_id": payment_id, "error": str(e)})
            return None
        if not payment:
            return None
        update_data = payment_update.model_dump(exclude_unset=True)
        
        # Convert amount to integer paise for storage
        if "amount" in update_data:
            update_data["amountPaise"] = parse_amount_to_paise(update_data["amount"])
            update_data.pop("amount")
        
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
        # Format amount for response
        payment["amount"] = format_amount_paise(payment.get("amountPaise", payment.get("amount", 0)))
        payment.pop("amountPaise", None)
        logger.info(
            "payment_updated",
            extra={
                "event": "payment_updated",
                "payment_id": payment_id,
                "tenant_id": payment.get("tenantId"),
                "property_id": payment.get("propertyId"),
                "updated_fields": list(update_data.keys()),
            },
        )
        return Payment(**payment)

    async def delete_payment(self, payment_id: str) -> bool:
        """Delete a single payment by ID"""
        now = datetime.now(timezone.utc).isoformat()
        try:
            result = await self.collection.update_one(
                {"_id": ObjectId(payment_id), "isDeleted": {"$ne": True}},
                {"$set": {"isDeleted": True, "updatedAt": now}}
            )
        except Exception as e:
            logger.warning("payment_delete_invalid_id", extra={"event": "payment_delete_invalid_id", "payment_id": payment_id, "error": str(e)})
            return False

        deleted = result.modified_count == 1
        if deleted:
            logger.info("payment_deleted", extra={"event": "payment_deleted", "payment_id": payment_id})
        return deleted

    async def delete_payments_by_tenant(self, tenant_id: str) -> int:
        """Delete all payments for a specific tenant. Returns count of deleted payments."""
        now = datetime.now(timezone.utc).isoformat()
        result = await self.collection.update_many(
            {"tenantId": tenant_id, "isDeleted": {"$ne": True}},
            {"$set": {"isDeleted": True, "updatedAt": now}}
        )
        logger.info(
            "payments_deleted_by_tenant",
            extra={"event": "payments_deleted_by_tenant", "tenant_id": tenant_id, "deleted_count": result.modified_count},
        )
        return result.modified_count