from app.models.tenant_schema import Tenant, TenantOut, BillingStatus, BillingCycle
from app.models.bed_schema import BedUpdate, BedStatus
from app.models.payment_schema import PaymentMethod
from app.services.bed_service import BedService
from app.database.mongodb import getCollection
from datetime import datetime, timezone, timedelta
from dateutil.relativedelta import relativedelta
from bson import ObjectId
from app.models.payment_schema import PaymentCreate
from app.services.payment_service import PaymentService
from app.models.tenant_schema import BillingConfig



bed_service = BedService()
payment_service = PaymentService()
class TenantService:

    def __init__(self):
        self.collection = getCollection("tenants")

    async def get_tenants(self, property_id: str = None, search: str = None, status: str = None, skip: int = 0, limit: int = 50, include_room_bed: bool = True):
        query = {"isDeleted": {"$ne": True}}
        if property_id:
            query["propertyId"] = property_id
        if search:
            # Search in name, phone, documentId
            query["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"documentId": {"$regex": search, "$options": "i"}}
            ]
        if status:
            # Filter by billingConfig.status
            query["billingConfig.status"] = status
        
        # Get total count
        total = await self.collection.count_documents(query)
        
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
            {"$skip": skip},
            {"$limit": limit}
        ])
        
        # Execute aggregation pipeline
        cursor = self.collection.aggregate(pipeline)
        tenants = []
        
        async for doc in cursor:
            doc["id"] = str(doc["_id"])
            tenants.append(TenantOut(**doc))
        
        return tenants, total

    async def get_tenant(self, tenant_id: str):
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if doc:
            doc["id"] = str(doc["_id"])
            return Tenant(**doc)
        return None

    async def create_tenant(self, tenant_data: dict):
        now = datetime.now(timezone.utc).isoformat()
        if not tenant_data.get("createdAt"):
            tenant_data["createdAt"] = now
        if not tenant_data.get("updatedAt"):
            tenant_data["updatedAt"] = now
        
        tenant_data["isDeleted"] = False

        # Validate bed is available if provided
        bed_id = tenant_data.get("bedId")
        if bed_id:
            bed = await bed_service.get_bed(bed_id)
            if bed and bed.status == BedStatus.OCCUPIED.value:
                raise ValueError(f"Bed is already occupied")
        
        # Get autoGeneratePayments flag
        auto_generate = tenant_data.get("autoGeneratePayments", True)
        
        # Ensure billingConfig is present and stored only if auto-generating payments
        billing_config = None
        if auto_generate and tenant_data.get("billingConfig"):
            billing_config = tenant_data.get("billingConfig")
            # Ensure billing_config is a BillingConfig model, not a dict
            if isinstance(billing_config, dict):
                billing_config = BillingConfig(**billing_config)
            # Convert to dict for MongoDB
            tenant_data["billingConfig"] = billing_config.model_dump()
        elif not auto_generate:
            # Remove billingConfig if auto-generate is disabled
            tenant_data.pop("billingConfig", None)
        
        result = await self.collection.insert_one(tenant_data)
        tenant_data["id"] = str(result.inserted_id)
        
        # Update bed with tenantId and occupied status after tenant is created
        if tenant_data.get("bedId"):
            await bed_service.update_bed(tenant_data["bedId"], BedUpdate(status=BedStatus.OCCUPIED.value, tenantId=tenant_data["id"]))

        # Create payment only if autoGeneratePayments is True and billingConfig exists
        if auto_generate and billing_config:
            # Calculate dueDate from anchorDay and billingCycle
            # anchorDay is just the day of month (e.g., 2 means the 2nd of every month)
            anchor_day = billing_config.anchorDay
            today = datetime.now(timezone.utc)
            
            # Set dueDate to anchorDay of current or next month
            # Use relativedelta to handle months with fewer days (e.g., Feb 30 becomes Feb 28)
            due_date = today + relativedelta(day=anchor_day)
            # If the anchor day has already passed this month, use next month
            if due_date < today:
                due_date = due_date + relativedelta(months=1)
            
            payment = PaymentCreate(
                tenantId=tenant_data["id"],
                propertyId=tenant_data["propertyId"],
                bed=tenant_data.get("bedId", ""),
                amount=tenant_data["rent"],
                status=billing_config.status,
                dueDate=due_date.date(),
                method=billing_config.method or PaymentMethod.CASH.value
            )
            await payment_service.create_payment(payment)

        return Tenant(**tenant_data)

    async def update_tenant(self, tenant_id: str, tenant_data: dict):
        tenant_data["updatedAt"] = datetime.now(timezone.utc).isoformat()
        for protected_key in ["isDeleted"]:
            tenant_data.pop(protected_key, None)

        # Get original tenant data
        orig_doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if not orig_doc:
            return None
            
        orig_bed_id = orig_doc.get("bedId")
        orig_room_id = orig_doc.get("roomId")
        orig_status = orig_doc.get("tenantStatus", "active")
        
        new_bed_id = tenant_data.get("bedId")
        new_room_id = tenant_data.get("roomId")
        new_status = tenant_data.get("tenantStatus", orig_status)
        
        # Validate new bed is available (if different from current bed)
        if new_bed_id and new_bed_id != orig_bed_id:
            bed = await bed_service.get_bed(new_bed_id)
            if bed and bed.status == BedStatus.OCCUPIED.value and bed.tenantId != tenant_id:
                raise ValueError(f"Bed {new_bed_id} is already occupied by another tenant")
        
        # Handle tenant status change to vacated
        if new_status == "vacated" and orig_status != "vacated":
            # Free up current bed if assigned
            if orig_bed_id:
                await bed_service.update_bed(orig_bed_id, BedUpdate(status=BedStatus.AVAILABLE.value, tenantId=None))
            
            # Clear roomId and bedId
            tenant_data["roomId"] = None
            tenant_data["bedId"] = None
            
            # Set checkout date if not already set
            if not tenant_data.get("checkoutDate"):
                tenant_data["checkoutDate"] = datetime.now(timezone.utc).isoformat()
            
            # Clear billingConfig for vacated tenant
            tenant_data["billingConfig"] = None
        
        # Handle tenant reactivation (vacated -> active)
        elif new_status == "active" and orig_status == "vacated":
            # Room and bed are mandatory when reactivating a tenant
            if not new_bed_id or not new_room_id:
                raise ValueError("Room and bed are mandatory when reactivating a vacated tenant")
            
            # Occupy the new bed
            await bed_service.update_bed(new_bed_id, BedUpdate(status=BedStatus.OCCUPIED.value, tenantId=tenant_id))
            
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
        
        # Update the tenant document
        await self.collection.update_one({"_id": ObjectId(tenant_id)}, {"$set": tenant_data})
        
        # Fetch and return updated tenant
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id)})
        if doc:
            doc["id"] = str(doc["_id"])
            return Tenant(**doc)
        return None

    async def delete_tenant(self, tenant_id: str):
        # Find the tenant to get the bedId
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id), "isDeleted": {"$ne": True}})
        if not doc:
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
        
        # Soft delete the tenant
        await self.collection.update_one(
            {"_id": ObjectId(tenant_id)},
            {"$set": {"isDeleted": True, "updatedAt": now}}
        )
        return {
            "success": True, 
            "tenantId": tenant_id,
            "message": "Tenant and all associated payment records soft-deleted successfully."
        }

    async def generate_monthly_payments(self):
        """
        Robust cron job with catch-up logic: ensures no payments are missed due to downtime.
        For each tenant, find the latest payment and generate all missing payments
        up to the current month's anchor day.
        
        Returns: {"created": int, "skipped": int, "errors": list, "duration_ms": int}
        """
        import time
        import logging
        from datetime import date
        
        logger = logging.getLogger(__name__)
        start_time = time.time()
        
        try:
            result = {"created": 0, "skipped": 0, "errors": []}
            payments_collection = getCollection("payments")
            today = datetime.now(timezone.utc).date()
            
            logger.info(f"[CRON] Starting payment generation at {today.isoformat()}")
            
            # 1. Fetch all tenants eligible for auto-billing
            tenant_cursor = self.collection.find({
                "isDeleted": {"$ne": True},
                "autoGeneratePayments": True,
                "billingConfig": {"$exists": True},
                "billingConfig.billingCycle": BillingCycle.MONTHLY.value,
                "tenantStatus": {"$ne": "vacated"} # Skip clearly vacated tenants (already handled by checkout date check below)
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
                    # Sort by dueDate descending to find the last one
                    latest_payment = await payments_collection.find_one(
                        {"tenantId": tenant_id, "isDeleted": {"$ne": True}},
                        sort=[("dueDate", -1)]
                    )
                    
                    # 3. Determine the start date for generating missing payments
                    if latest_payment:
                        # Start from the month after the latest payment
                        last_due_date = date.fromisoformat(latest_payment["dueDate"])
                        # Move to the same anchor day in the next month
                        current_due_date = last_due_date + relativedelta(months=1, day=anchor_day)
                    else:
                        # Fall back to joinDate if no payments exist
                        join_date_str = tenant_doc.get("joinDate")
                        if not join_date_str:
                            continue # Cannot determine start date
                        
                        join_date = date.fromisoformat(join_date_str)
                        # First payment is on the anchorDay of the joining month OR next month
                        current_due_date = join_date + relativedelta(day=anchor_day)
                        if current_due_date < join_date:
                            current_due_date = current_due_date + relativedelta(months=1)
                    
                    # 4. Target due date: The upcoming (or current) anchor day
                    # If today is March 11 and anchor is 5, target is March 5.
                    # If today is March 3 and anchor is 5, target is Feb 5 (if not already paid) OR wait until March 5.
                    # Actually, if today is March 3 and anchor is 5, the "expected" due date for March isn't here yet.
                    # The "latest" expected due date as of 'today' is:
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
                        checkout_limit = date.fromisoformat(checkout_date_str)

                    # 6. Generate all missing payments in the gap
                    while current_due_date <= target_due_date:
                        # Stop if we pass the checkout date
                        if checkout_limit and current_due_date > checkout_limit:
                            break
                            
                        # Build payment data
                        payment_data = {
                            "tenantId": tenant_id,
                            "propertyId": tenant_doc.get("propertyId"),
                            "bed": tenant_doc.get("bedId", ""),
                            "amount": tenant_doc.get("rent", "0"),
                            "status": "due", # Missing payments are always 'due' by default
                            "dueDate": current_due_date.isoformat(),
                            "method": billing_config.method or PaymentMethod.CASH.value,
                            "isDeleted": False,
                            "createdAt": datetime.now(timezone.utc),
                            "updatedAt": datetime.now(timezone.utc)
                        }
                        
                        # Double check existence (uniqueness index also protects)
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
                    logger.error(f"[CRON] Error for tenant {tenant_doc.get('_id')}: {str(tenant_error)}")
                    result["errors"].append({
                        "tenantId": str(tenant_doc.get("_id", "unknown")),
                        "error": str(tenant_error)
                    })
            
            duration_ms = int((time.time() - start_time) * 1000)
            result["duration_ms"] = duration_ms
            logger.info(f"[CRON] Completed: created={result['created']}, skipped={result['skipped']}, errors={len(result['errors'])}, duration={duration_ms}ms")
            return result
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"[CRON] Job failed: {str(e)}")
            return {
                "created": 0, "skipped": 0, "duration_ms": duration_ms,
                "errors": [{"job": "generate_monthly_payments", "error": str(e)}]
            }
