from app.models.tenant_schema import Tenant, TenantOut, BillingStatus, BillingCycle
from app.models.bed_schema import BedUpdate, BedStatus
from app.models.payment_schema import PaymentMethod
from app.services.bed_service import BedService
from app.database.mongodb import getCollection, client
from datetime import datetime, timezone, date
from dateutil.relativedelta import relativedelta
from bson import ObjectId
from bson.errors import InvalidId
from app.models.payment_schema import PaymentCreate
from app.services.payment_service import PaymentService
from app.models.tenant_schema import BillingConfig
from typing import Optional, List
from pymongo.errors import OperationFailure
import logging



bed_service = BedService()
payment_service = PaymentService()
logger = logging.getLogger(__name__)


class TenantService:

    def __init__(self):
        self.collection = getCollection("tenants")

    @staticmethod
    def _coerce_to_date(value: str) -> date:
        """Parse either YYYY-MM-DD or full ISO datetime into a date."""
        try:
            return date.fromisoformat(value)
        except Exception:
            return datetime.fromisoformat(value.replace('Z', '+00:00')).date()

    @staticmethod
    def _get_current_month_anchor(anchor_day: int, today: date) -> date:
        """Return the anchor date in the current month (clamped by calendar)."""
        return today + relativedelta(day=anchor_day)

    @classmethod
    def _calculate_initial_due_date(cls, anchor_day: int, billing_status: str, today: date) -> date:
        """
        Calculate the due date for the initial payment when a tenant is created.

        Rules:
        - `due`: next upcoming anchor (current month if anchor not yet passed, else next month).
        - `paid`: most recently passed anchor (current month if anchor passed, else previous month).
        """
        current_month_anchor = cls._get_current_month_anchor(anchor_day, today)
        is_future_anchor = current_month_anchor > today

        if billing_status == BillingStatus.DUE.value:
            # Anchor already passed this month — next due date is next month
            if not is_future_anchor:
                return current_month_anchor + relativedelta(months=1)
            return current_month_anchor
        else:  # paid
            # Anchor hasn't arrived yet this month — last billing cycle was previous month
            if is_future_anchor:
                return current_month_anchor - relativedelta(months=1)
            return current_month_anchor

    @classmethod
    def _calculate_due_date_for_join_date(cls, anchor_day: int, join_date: date, today: date) -> date:
        """
        Calculate initial due date based on selected join date.

        Rules:
        - past join date: schedule next month on anchor day.
        - future join date: schedule this month on anchor day (or next month if current month's anchor already passed).
        - today's join date: falls back to standard initial due-date logic.

        Uses relativedelta(day=anchor_day) so months with fewer days are clamped safely.
        """
        current_month_anchor = cls._get_current_month_anchor(anchor_day, today)

        if join_date < today:
            return current_month_anchor + relativedelta(months=1)

        if join_date > today:
            if current_month_anchor > today:
                return current_month_anchor
            return current_month_anchor + relativedelta(months=1)

        return cls._calculate_initial_due_date(
            anchor_day=anchor_day,
            billing_status=BillingStatus.DUE.value,
            today=today,
        )

    @staticmethod
    def _is_transaction_not_supported_error(exc: Exception) -> bool:
        return (
            isinstance(exc, OperationFailure)
            and exc.code == 20
            and "Transaction numbers are only allowed" in str(exc)
        )

    async def get_tenants(
        self,
        property_id: str = None,
        search: str = None,
        status: str = None,
        skip: int = 0,
        limit: int = 50,
        include_room_bed: bool = True,
        property_ids: Optional[List[str]] = None,
        sort: str = None,
    ):
        query = {"isDeleted": {"$ne": True}}

        if property_ids is not None:
            if not property_ids:
                return [], 0
            query["propertyId"] = {"$in": property_ids}

        if property_id:
            if property_ids is not None and property_id not in property_ids:
                return [], 0
            query["propertyId"] = property_id
        if search:
            # Search in name, phone, documentId
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"documentId": {"$regex": search, "$options": "i"}}
            ]
        if status:
            # Filter by tenantStatus (active/vacated)
            query["tenantStatus"] = status
        
        # Get total count
        total = await self.collection.count_documents(query)
        
        # Determine sort order
        sort_order = -1  # Default: newest first
        if sort == 'oldest':
            sort_order = 1
        
        # Build aggregation pipeline to replace N+1 queries
        pipeline = [{"$match": query}]
        
        if include_room_bed:
            pipeline.extend([
                # Lookup room info
                {
                    "$lookup": {
                        "from": "rooms",
                        "let": {"roomId": "$roomId"},
                        "as": "room_info",
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$eq": [
                                            {"$toString": "$_id"},
                                            {"$toString": "$$roomId"}
                                        ]
                                    }
                                }
                            },
                            {"$project": {"roomNumber": 1}}
                        ]
                    }
                },
                # Lookup bed info
                {
                    "$lookup": {
                        "from": "beds",
                        "let": {"bedId": "$bedId"},
                        "as": "bed_info",
                        "pipeline": [
                            {
                                "$match": {
                                    "$expr": {
                                        "$eq": [
                                            {"$toString": "$_id"},
                                            {"$toString": "$$bedId"}
                                        ]
                                    }
                                }
                            },
                            {"$project": {"bedNumber": 1}}
                        ]
                    }
                },
                # Project enriched fields
                {
                    "$project": {
                        "_id": 1,
                        "propertyId": 1,
                        "roomId": 1,
                        "bedId": 1,
                        "name": 1,
                        "documentId": 1,
                        "phone": 1,
                        "rent": 1,
                        "status": 1,
                        "tenantStatus": 1,
                        "address": 1,
                        "joinDate": 1,
                        "checkoutDate": 1,
                        "createdAt": 1,
                        "updatedAt": 1,
                        "billingConfig": 1,
                        "autoGeneratePayments": 1,
                        "roomNumber": {"$arrayElemAt": ["$room_info.roomNumber", 0]},
                        "bedNumber": {"$arrayElemAt": ["$bed_info.bedNumber", 0]},
                        "isDeleted": 1
                    }
                }
            ])
        
        pipeline.extend([
            {"$sort": {"createdAt": sort_order}},  # Sort by createdAt: -1 for newest first, 1 for oldest first
            {"$skip": skip},
            {"$limit": limit}
        ])
        
        # Execute aggregation pipeline
        cursor = self.collection.aggregate(pipeline)
        tenants = []
        
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            tenants.append(TenantOut(**doc))

        logger.info(
            "tenant_list_success",
            extra={
                "event": "tenant_list_success",
                "property_id": property_id,
                "property_ids_count": len(property_ids) if property_ids is not None else None,
                "search": bool(search),
                "status": status,
                "returned_count": len(tenants),
                "total": total,
                "skip": skip,
                "limit": limit,
            },
        )
        
        return tenants, total

    async def get_tenant(self, tenant_id: str):
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if doc:
            doc["id"] = str(doc["_id"])
            return Tenant(**doc)
        logger.warning("tenant_get_not_found", extra={"event": "tenant_get_not_found", "tenant_id": tenant_id})
        return None

    async def create_tenant(self, tenant_data: dict):
        now = datetime.now(timezone.utc).isoformat()
        if not tenant_data.get("createdAt"):
            tenant_data["createdAt"] = now
        if not tenant_data.get("updatedAt"):
            tenant_data["updatedAt"] = now
        
        tenant_data["isDeleted"] = False

        today_date = datetime.now(timezone.utc).date()
        join_date_value = tenant_data.get("joinDate")
        join_date = self._coerce_to_date(join_date_value) if join_date_value else today_date

        # Get autoGeneratePayments flag
        auto_generate = tenant_data.get("autoGeneratePayments", True)
        
        # Ensure billingConfig is present and stored only if auto-generating payments
        billing_config = None
        if auto_generate and tenant_data.get("billingConfig"):
            billing_config = tenant_data.get("billingConfig")
            # Ensure billing_config is a BillingConfig model, not a dict
            if isinstance(billing_config, dict):
                billing_config = BillingConfig(**billing_config)

            # NOTE: We intentionally DON'T override status to DUE here if join_date != today_date
            # as per the requirement to respect the user's choice (Paid/Due).

            # Convert to dict for MongoDB
            tenant_data["billingConfig"] = billing_config.model_dump()
        elif not auto_generate:
            # Remove billingConfig if auto-generate is disabled
            tenant_data.pop("billingConfig", None)

        async def _reserve_bed_insert_tenant_and_link(*, session=None) -> None:
            bed_id = tenant_data.get("bedId")
            bed_collection = self.collection.database["beds"]

            session_kwargs = {"session": session} if session is not None else {}
            find_and_update_kwargs = {"return_document": True, **session_kwargs}

            if bed_id:
                # Reserve bed first so duplicate assignments are rejected.
                try:
                    bed_filter = {"_id": ObjectId(bed_id), "status": "available", "isDeleted": {"$ne": True}}
                except InvalidId:
                    bed_filter = {"id": bed_id, "status": "available", "isDeleted": {"$ne": True}}

                result = await bed_collection.find_one_and_update(
                    bed_filter,
                    {"$set": {"status": BedStatus.OCCUPIED.value, "updatedAt": now}},
                    **find_and_update_kwargs,
                )
                if not result:
                    result = await bed_collection.find_one_and_update(
                        {"id": bed_id, "status": "available", "isDeleted": {"$ne": True}},
                        {"$set": {"status": BedStatus.OCCUPIED.value, "updatedAt": now}},
                        **find_and_update_kwargs,
                    )
                if not result:
                    raise ValueError("Bed not found or already occupied")

            result = await self.collection.insert_one(tenant_data, **session_kwargs)
            tenant_data["id"] = str(result.inserted_id)

            if bed_id:
                try:
                    await bed_collection.update_one(
                        {"_id": ObjectId(bed_id)},
                        {"$set": {"tenantId": tenant_data["id"]}},
                        **session_kwargs,
                    )
                except InvalidId:
                    await bed_collection.update_one(
                        {"id": bed_id},
                        {"$set": {"tenantId": tenant_data["id"]}},
                        **session_kwargs,
                    )

        # Prefer transaction for atomicity, but gracefully degrade for non-replica deployments.
        try:
            async with await client.start_session() as session:
                async with session.start_transaction():
                    await _reserve_bed_insert_tenant_and_link(session=session)
        except Exception as exc:
            if not self._is_transaction_not_supported_error(exc):
                raise

            logger.warning(
                "tenant_create_fallback_without_transaction",
                extra={
                    "event": "tenant_create_fallback_without_transaction",
                    "reason": str(exc),
                },
            )
            await _reserve_bed_insert_tenant_and_link()

        # Create payment outside transaction (can be retried independently if it fails)
        if auto_generate and billing_config:
            anchor_day = billing_config.anchorDay
            current_month_anchor = self._get_current_month_anchor(anchor_day, today_date)
            is_future_anchor = current_month_anchor > today_date
            is_future_join = join_date > today_date
            is_past_or_today_join = join_date <= today_date

            # If join date OR anchor is in future, schedule for that future date
            if is_future_join or is_future_anchor:
                # Schedule for the future anchor date
                if is_future_anchor:
                    due_date = current_month_anchor
                else:
                    due_date = current_month_anchor + relativedelta(months=1)
                initial_status = billing_config.status
            else:
                # Both join date and anchor are today or past - create payment immediately (today)
                due_date = today_date
                initial_status = billing_config.status

            payment = PaymentCreate(
                tenantId=tenant_data["id"],
                propertyId=tenant_data["propertyId"],
                bed=tenant_data.get("bedId"),
                amount=tenant_data["rent"],
                status=initial_status,
                dueDate=due_date,
                method=billing_config.method if initial_status == BillingStatus.PAID.value else None
            )
            await payment_service.create_payment(payment)

        logger.info(
            "tenant_create_success",
            extra={
                "event": "tenant_create_success",
                "tenant_id": tenant_data.get("id"),
                "property_id": tenant_data.get("propertyId"),
                "room_id": tenant_data.get("roomId"),
                "bed_id": tenant_data.get("bedId"),
                "auto_generate_payments": bool(auto_generate),
            },
        )

        return Tenant(**tenant_data)

    async def update_tenant(self, tenant_id: str, tenant_data: dict):
        tenant_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        for protected_key in ["isDeleted"]:
            tenant_data.pop(protected_key, None)

        # Get original tenant data
        orig_doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if not orig_doc:
            logger.warning("tenant_update_not_found", extra={"event": "tenant_update_not_found", "tenant_id": tenant_id})
            return None
            
        orig_bed_id = orig_doc.get("bedId")
        orig_room_id = orig_doc.get("roomId")
        orig_status = orig_doc.get("tenantStatus", "active")
        
        # For PATCH semantics, keep existing room/bed when fields are omitted.
        # This avoids false validation failures on partial updates (e.g. billing-only edits).
        new_bed_id = tenant_data.get("bedId", orig_bed_id)
        new_room_id = tenant_data.get("roomId", orig_room_id)
        new_status = tenant_data.get("tenantStatus", orig_status)
        
        # Handle tenant status change to vacated
        if new_status == "vacated" and orig_status != "vacated":
            # Use transaction to free up bed atomically
            async with await client.start_session() as session:
                async with session.start_transaction():
                    if orig_bed_id:
                        result = await self.collection.database["beds"].find_one_and_update(
                            {"$or": [{"_id": ObjectId(orig_bed_id)}, {"id": orig_bed_id}], "isDeleted": {"$ne": True}},
                            {"$set": {"status": BedStatus.AVAILABLE.value, "tenantId": None, "updatedAt": datetime.now(timezone.utc).isoformat()}},
                            return_document=True,
                            session=session
                        )
                        if not result:
                            raise ValueError(f"Bed {orig_bed_id} not found")
            
            # Clear roomId and bedId
            tenant_data["roomId"] = None
            tenant_data["bedId"] = None
            
            # Set checkout date if not already set
            if not tenant_data.get("checkoutDate"):
                tenant_data["checkoutDate"] = datetime.now(timezone.utc).isoformat()
            
            # Clear billingConfig for vacated tenant
            tenant_data["billingConfig"] = None
            logger.info("tenant_status_vacated", extra={"event": "tenant_status_vacated", "tenant_id": tenant_id, "old_status": orig_status})
        
        # Handle tenant reactivation (vacated -> active)
        elif new_status == "active" and orig_status == "vacated":
            # Room and bed are mandatory when reactivating a tenant
            if not new_bed_id or not new_room_id:
                raise ValueError("Room and bed are mandatory when reactivating a vacated tenant")
            
            # Use transaction to atomically occupy the new bed
            async with await client.start_session() as session:
                async with session.start_transaction():
                    result = await self.collection.database["beds"].find_one_and_update(
                        {"$or": [{"_id": ObjectId(new_bed_id)}, {"id": new_bed_id}],
                         "status": "available", "isDeleted": {"$ne": True}},
                        {"$set": {"status": BedStatus.OCCUPIED.value, "tenantId": tenant_id, "updatedAt": datetime.now(timezone.utc).isoformat()}},
                        return_document=True,
                        session=session
                    )
                    if not result:
                        raise ValueError("Bed is already occupied or not found")
            
            # Clear checkout date when reactivating
            if "checkoutDate" not in tenant_data:
                tenant_data["checkoutDate"] = None
            logger.info("tenant_status_reactivated", extra={"event": "tenant_status_reactivated", "tenant_id": tenant_id, "room_id": new_room_id, "bed_id": new_bed_id})
        
        # Handle bed changes for active tenants
        elif new_status == "active":
            # Room and bed are mandatory for active tenants
            if not new_bed_id or not new_room_id:
                raise ValueError("Room and bed are mandatory for active tenants")
            
            bed_changed = orig_bed_id != new_bed_id
            
            if bed_changed:
                # Use transaction to atomically free old bed and occupy new bed
                async with await client.start_session() as session:
                    async with session.start_transaction():
                        # Free up old bed if it existed
                        if orig_bed_id:
                            result = await self.collection.database["beds"].find_one_and_update(
                                {"$or": [{"_id": ObjectId(orig_bed_id)}, {"id": orig_bed_id}],
                                 "isDeleted": {"$ne": True}},
                                {"$set": {"status": BedStatus.AVAILABLE.value, "tenantId": None, "updatedAt": datetime.now(timezone.utc).isoformat()}},
                                return_document=True,
                                session=session
                            )
                            if not result:
                                raise ValueError(f"Original bed {orig_bed_id} not found")
                        
                        # Occupy new bed if it's being assigned
                        if new_bed_id:
                            result = await self.collection.database["beds"].find_one_and_update(
                                {"$or": [{"_id": ObjectId(new_bed_id)}, {"id": new_bed_id}],
                                 "status": "available", "isDeleted": {"$ne": True}},
                                {"$set": {"status": BedStatus.OCCUPIED.value, "tenantId": tenant_id, "updatedAt": datetime.now(timezone.utc).isoformat()}},
                                return_document=True,
                                session=session
                            )
                            if not result:
                                raise ValueError("New bed is already occupied or not found")
            
            # Clear checkout date when reactivating
            if "checkoutDate" not in tenant_data:
                tenant_data["checkoutDate"] = None
        
        # Handle bed changes for active tenants
        elif new_status == "active":
            # Room and bed are mandatory for active tenants
            if not new_bed_id or not new_room_id:
                raise ValueError("Room and bed are mandatory for active tenants")
            
            bed_changed = orig_bed_id != new_bed_id
            
            if bed_changed:
                # Free up old bed if it existed
                if orig_bed_id:
                    await bed_service.update_bed(orig_bed_id, BedUpdate(status=BedStatus.AVAILABLE.value, tenantId=None))
                
                # Occupy new bed if it's being assigned
                if new_bed_id:
                    await bed_service.update_bed(new_bed_id, BedUpdate(status=BedStatus.OCCUPIED.value, tenantId=tenant_id))
        
        # Ensure billingConfig is handled properly
        if "billingConfig" in tenant_data:
            tenant_data["billingConfig"] = tenant_data["billingConfig"] or None

        # Handle autoGeneratePayments toggle and Syncing Updates
        orig_auto_generate = orig_doc.get("autoGeneratePayments", True)
        new_auto_generate = tenant_data.get("autoGeneratePayments", orig_auto_generate)
        payments_collection = getCollection("payments")
        today_date = datetime.now(timezone.utc).date()

        # Update rent/billing for future DUE payments if they changed
        rent_changed = "rent" in tenant_data and tenant_data["rent"] != orig_doc.get("rent")
        billing_changed = "billingConfig" in tenant_data and tenant_data["billingConfig"] != orig_doc.get("billingConfig")
        
        if (rent_changed or billing_changed) and new_auto_generate:
            update_fields = {}
            if rent_changed:
                update_fields["amount"] = tenant_data["rent"]
            
            if billing_changed and tenant_data["billingConfig"]:
                new_conf = tenant_data["billingConfig"]
                # For simplicity, we only update the 'method' if it changed
                if new_conf.get("method") != orig_doc.get("billingConfig", {}).get("method"):
                    update_fields["method"] = new_conf["method"]

            if update_fields:
                await payments_collection.update_many(
                    {
                        "tenantId": tenant_id,
                        "status": "due",
                        "isDeleted": {"$ne": True},
                        "dueDate": {"$gte": today_date.isoformat()},
                    },
                    {"$set": {**update_fields, "updatedAt": datetime.now(timezone.utc).isoformat()}}
                )

        if orig_auto_generate and not new_auto_generate:
            # Case A: Auto -> Manual
            # Soft-delete all future unpaid (due) auto-generated payments for this tenant
            await payments_collection.update_many(
                {
                    "tenantId": tenant_id,
                    "status": "due",
                    "isDeleted": {"$ne": True},
                    "dueDate": {"$gte": today_date.isoformat()},
                },
                {"$set": {"isDeleted": True, "updatedAt": datetime.now(timezone.utc).isoformat()}}
            )

        elif not orig_auto_generate and new_auto_generate:
            # Case B: Manual -> Auto
            # Immediately create an initial payment using consistent logic
            new_billing_config_data = tenant_data.get("billingConfig") or orig_doc.get("billingConfig")
            if new_billing_config_data:
                if isinstance(new_billing_config_data, dict):
                    new_billing_config = BillingConfig(**new_billing_config_data)
                else:
                    new_billing_config = new_billing_config_data
                
                # Calculate due date - create payment immediately if anchor is not in future
                anchor_day = new_billing_config.anchorDay
                current_month_anchor = self._get_current_month_anchor(anchor_day, today_date)
                is_future_anchor = current_month_anchor > today_date
                
                if is_future_anchor:
                    due_date = current_month_anchor
                else:
                    # Create payment immediately (today) - same logic as create_tenant
                    due_date = today_date

                # Only create if no payment already exists for this month/due-date
                existing = await payments_collection.find_one({
                    "tenantId": tenant_id,
                    "dueDate": due_date.isoformat(),
                    "isDeleted": {"$ne": True},
                })
                if not existing:
                    current_rent = tenant_data.get("rent") or orig_doc.get("rent", "0")
                    current_bed = tenant_data.get("bedId") or orig_doc.get("bedId")
                    current_property = tenant_data.get("propertyId") or orig_doc.get("propertyId")
                    initial_payment = PaymentCreate(
                        tenantId=tenant_id,
                        propertyId=current_property,
                        bed=current_bed,
                        amount=current_rent,
                        status=new_billing_config.status,
                        dueDate=due_date,
                        method=new_billing_config.method if new_billing_config.status == BillingStatus.PAID.value else None,
                    )
                    await payment_service.create_payment(initial_payment)

        # Update the tenant document
        await self.collection.update_one({"_id": ObjectId(tenant_id)}, {"$set": tenant_data})
        
        # Fetch and return updated tenant
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id)})
        if doc:
            doc["id"] = str(doc["_id"])
            logger.info(
                "tenant_update_success",
                extra={
                    "event": "tenant_update_success",
                    "tenant_id": tenant_id,
                    "property_id": doc.get("propertyId"),
                    "tenant_status": doc.get("tenantStatus"),
                },
            )
            return Tenant(**doc)
        logger.warning("tenant_update_postfetch_not_found", extra={"event": "tenant_update_postfetch_not_found", "tenant_id": tenant_id})
        return None

    async def delete_tenant(self, tenant_id: str):
        # Find the tenant to get the bedId
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if not doc:
            logger.warning("tenant_delete_not_found", extra={"event": "tenant_delete_not_found", "tenant_id": tenant_id})
            return {"success": False, "message": "Tenant not found or already deleted."}

        bed_id = doc.get("bedId")
        if bed_id:
            # Set bed to available and clear tenantId
            await bed_service.update_bed(bed_id, BedUpdate(status=BedStatus.AVAILABLE.value, tenantId=None))
        
        now = datetime.now(timezone.utc).isoformat()

        # Soft delete all payments associated with this tenant
        payments_collection = getCollection("payments")
        await payments_collection.update_many(
            {"tenantId": tenant_id},
            {"$set": {"isDeleted": True, "updatedAt": now}}
        )
        
        # Soft delete the tenant and normalize status fields for consistency
        await self.collection.update_one(
            {"_id": ObjectId(tenant_id)},
            {
                "$set": {
                    "isDeleted": True,
                    "updatedAt": now,
                    "tenantStatus": "vacated",
                    "checkoutDate": doc.get("checkoutDate") or now,
                    "billingConfig": None,
                    "roomId": None,
                    "bedId": None,
                }
            }
        )
        logger.info("tenant_delete_success", extra={"event": "tenant_delete_success", "tenant_id": tenant_id, "property_id": doc.get("propertyId")})
        return {
            "success": True, 
            "tenantId": tenant_id,
            "message": "Tenant and all associated payment records soft-deleted successfully."
        }

    async def generate_monthly_payments(self):
        """
        Robust cron job with catch-up logic and historical guardrails.
        Ensures no payments are missed due to downtime, but limits backfilling to 60 days.
        """
        import time
        from datetime import date

        start_time = time.time()
        
        try:
            result = {"created": 0, "skipped": 0, "errors": []}
            payments_collection = getCollection("payments")
            today = datetime.now(timezone.utc).date()
            
            # Guardrail: Never look back more than 60 days
            min_allowed_start = today - relativedelta(days=60)
            
            logger.info("tenant_payment_cron_started", extra={"event": "tenant_payment_cron_started", "date": today.isoformat()})
            
            # 1. Fetch all tenants eligible for auto-billing
            tenant_cursor = self.collection.find({
                "isDeleted": {"$ne": True},
                "autoGeneratePayments": True,
                "billingConfig": {"$exists": True},
                "billingConfig.billingCycle": BillingCycle.MONTHLY.value,
                "tenantStatus": {"$ne": "vacated"} 
            })
            
            async for tenant_doc in tenant_cursor:
                try:
                    tenant_id = str(tenant_doc["_id"])
                    billing_config_dict = tenant_doc.get("billingConfig", {})
                    if not billing_config_dict:
                        continue
                        
                    billing_config = BillingConfig(**billing_config_dict)
                    anchor_day = billing_config.anchorDay
                    
                    # 2. Find the latest payment's dueDate for this tenant
                    latest_payment = await payments_collection.find_one(
                        {"tenantId": tenant_id, "isDeleted": {"$ne": True}},
                        sort=[("dueDate", -1)]
                    )
                    
                    # 3. Determine the start date for generating missing payments
                    if latest_payment:
                        # Start from the month after the latest payment
                        last_due_date = self._coerce_to_date(latest_payment["dueDate"])
                        current_due_date = last_due_date + relativedelta(months=1, day=anchor_day)
                    else:
                        # Fall back to joinDate with guardrail
                        join_date_str = tenant_doc.get("joinDate")
                        if not join_date_str:
                            continue 
                        
                        join_date = self._coerce_to_date(join_date_str)
                        # Apply guardrail: don't start before today - 60 days
                        start_tracking_date = max(join_date, min_allowed_start)
                        
                        current_due_date = start_tracking_date + relativedelta(day=anchor_day)
                        if current_due_date < start_tracking_date:
                            current_due_date = current_due_date + relativedelta(months=1)
                    
                    # 4. Target due date: The upcoming (or current) anchor day
                    target_due_date = today + relativedelta(day=anchor_day)
                    if target_due_date > today:
                        target_due_date = target_due_date - relativedelta(months=1)
                    
                    # Skip if we are already up to date
                    if current_due_date > target_due_date:
                        result["skipped"] += 1
                        continue

                    # 5. Check for checkout date to bound generation
                    checkout_limit = None
                    checkout_date_str = tenant_doc.get("checkoutDate")
                    if checkout_date_str:
                        checkout_limit = self._coerce_to_date(checkout_date_str)

                    # 6. Generate all missing payments in the gap
                    while current_due_date <= target_due_date:
                        if checkout_limit and current_due_date > checkout_limit:
                            break
                            
                        # Build payment data
                        payment_data = {
                            "tenantId": tenant_id,
                            "propertyId": tenant_doc.get("propertyId"),
                            "bed": tenant_doc.get("bedId", ""),
                            "amount": tenant_doc.get("rent", "0"),
                            "status": "due", 
                            "dueDate": current_due_date.isoformat(),
                            "method": billing_config.method or PaymentMethod.CASH.value,
                            "isDeleted": False,
                            "createdAt": datetime.now(timezone.utc),
                            "updatedAt": datetime.now(timezone.utc)
                        }
                        
                        exists = await payments_collection.find_one({
                            "tenantId": tenant_id,
                            "dueDate": payment_data["dueDate"],
                            "isDeleted": {"$ne": True}
                        })
                        
                        if not exists:
                            await payments_collection.insert_one(payment_data)
                            result["created"] += 1
                        else:
                            result["skipped"] += 1
                            
                        # Advance to next month's anchor day
                        current_due_date = current_due_date + relativedelta(months=1, day=anchor_day)

                except Exception as tenant_error:
                    logger.exception(
                        "tenant_payment_cron_tenant_failed",
                        extra={
                            "event": "tenant_payment_cron_tenant_failed",
                            "tenant_id": str(tenant_doc.get("_id", "unknown")),
                            "error": str(tenant_error),
                        },
                    )
                    result["errors"].append({
                        "tenantId": str(tenant_doc.get("_id", "unknown")),
                        "error": str(tenant_error)
                    })
            
            duration_ms = int((time.time() - start_time) * 1000)
            result["duration_ms"] = duration_ms
            logger.info(
                "tenant_payment_cron_completed",
                extra={
                    "event": "tenant_payment_cron_completed",
                    "created": result["created"],
                    "skipped": result["skipped"],
                    "errors": len(result["errors"]),
                    "duration_ms": duration_ms,
                },
            )
            return result
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.exception("tenant_payment_cron_failed", extra={"event": "tenant_payment_cron_failed", "error": str(e), "duration_ms": duration_ms})
            return {
                "created": 0, "skipped": 0, "duration_ms": duration_ms,
                "errors": [{"job": "generate_monthly_payments", "error": str(e)}]
            }
