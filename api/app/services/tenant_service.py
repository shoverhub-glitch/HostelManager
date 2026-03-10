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
        query = {}
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
                        "bedNumber": {"$arrayElemAt": ["$bed_info.bedNumber", 0]}
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
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id)})
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
        
        # Get original tenant data
        orig_doc = await self.collection.find_one({"_id": ObjectId(tenant_id)})
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
        doc = await self.collection.find_one({"_id": ObjectId(tenant_id)})
        bed_id = doc.get("bedId") if doc else None
        if bed_id:
            # Set bed to available and clear tenantId
            await bed_service.update_bed(bed_id, BedUpdate(status=BedStatus.AVAILABLE.value, tenantId=None))
        
        # Delete all payments associated with this tenant
        payments_collection = getCollection("payments")
        await payments_collection.delete_many({"tenantId": tenant_id})
        
        # Delete the tenant
        await self.collection.delete_one({"_id": ObjectId(tenant_id)})
        return {
            "success": True, 
            "tenantId": tenant_id,
            "message": "Tenant and all associated payment records deleted successfully."
        }

    async def generate_monthly_payments(self):
        """
        Optimized cron job: generates recurring monthly payments.
        Uses cursor iteration (memory-efficient), batch inserts, and logging.
        
        Returns: {"created": int, "skipped": int, "errors": list, "duration_ms": int}
        """
        import time
        import logging
        
        logger = logging.getLogger(__name__)
        start_time = time.time()
        
        try:
            result = {"created": 0, "skipped": 0, "errors": []}
            payments_collection = getCollection("payments")
            today = datetime.now(timezone.utc).date()
            
            logger.info(f"[CRON] Starting payment generation at {today.isoformat()}")
            
            # Use cursor iteration instead of .to_list(None) - memory efficient
            tenant_cursor = self.collection.find({
                "autoGeneratePayments": True,
                "billingConfig": {"$exists": True},
                "billingConfig.billingCycle": BillingCycle.MONTHLY.value
            })
            
            payments_to_insert = []
            batch_size = 100  # Insert 100 at a time
            
            async for tenant_doc in tenant_cursor:
                try:
                    tenant_id = str(tenant_doc["_id"])
                    billing_config_dict = tenant_doc.get("billingConfig", {})
                    
                    if not billing_config_dict:
                        result["skipped"] += 1
                        continue
                    
                    # Parse billing config
                    try:
                        billing_config = BillingConfig(**billing_config_dict)
                    except Exception:
                        result["skipped"] += 1
                        continue
                    
                    # Skip if tenant has checked out
                    checkout_date_str = tenant_doc.get("checkoutDate")
                    if checkout_date_str:
                        checkout_date = datetime.fromisoformat(checkout_date_str).date()
                        if today > checkout_date:
                            result["skipped"] += 1
                            continue
                    
                    # Determine due date based on billing cycle
                    due_date = None
                    
                    # Calculate due date for monthly billing
                    due_date = today + relativedelta(day=billing_config.anchorDay)
                    if due_date < today:
                        due_date = due_date + relativedelta(months=1)
                    
                    if not due_date:
                        result["skipped"] += 1
                        continue
                    
                    # Build payment data
                    payment_data = {
                        "tenantId": tenant_id,
                        "propertyId": tenant_doc.get("propertyId"),
                        "bed": tenant_doc.get("bedId", ""),
                        "amount": tenant_doc.get("rent", "0"),  # Keep as string
                        "status": billing_config.status,
                        "dueDate": due_date.isoformat(),
                        "method": billing_config.method or PaymentMethod.CASH.value,
                        "createdAt": datetime.now(timezone.utc),
                        "updatedAt": datetime.now(timezone.utc)
                    }
                    
                    payments_to_insert.append(payment_data)
                    result["created"] += 1
                    
                    # Batch insert when reaching batch size
                    if len(payments_to_insert) >= batch_size:
                        try:
                            await payments_collection.insert_many(payments_to_insert, ordered=False)
                            logger.info(f"[CRON] Inserted batch of {len(payments_to_insert)} payments")
                            payments_to_insert = []
                        except Exception as batch_error:
                            logger.error(f"[CRON] Batch insert failed: {str(batch_error)}")
                            result["errors"].append({"error": f"batch_insert: {str(batch_error)}"})
                            payments_to_insert = []  # Clear batch and continue
                
                except Exception as e:
                    result["errors"].append({
                        "tenantId": str(tenant_doc.get("_id", "unknown")),
                        "error": str(e)
                    })
            
            # Insert remaining payments
            if payments_to_insert:
                try:
                    await payments_collection.insert_many(payments_to_insert, ordered=False)
                    logger.info(f"[CRON] Inserted final batch of {len(payments_to_insert)} payments")
                except Exception as batch_error:
                    logger.error(f"[CRON] Final batch insert failed: {str(batch_error)}")
                    result["errors"].append({"error": f"final_batch: {str(batch_error)}"})
            
            duration_ms = int((time.time() - start_time) * 1000)
            result["duration_ms"] = duration_ms
            
            logger.info(f"[CRON] Completed: created={result['created']}, skipped={result['skipped']}, errors={len(result['errors'])}, duration={duration_ms}ms")
            
            return result
            
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"[CRON] Failed: {str(e)}, duration={duration_ms}ms")
            return {
                "created": 0,
                "skipped": 0,
                "errors": [{"job": "generate_monthly_payments", "error": str(e)}],
                "duration_ms": duration_ms
            }
