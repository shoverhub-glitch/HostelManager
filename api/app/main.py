from dotenv import load_dotenv
load_dotenv() 
from app.database.mongodb import db
from contextlib import asynccontextmanager
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from datetime import datetime, timezone, timedelta
import logging
from pymongo.errors import OperationFailure, ServerSelectionTimeoutError
from urllib.parse import urlparse

import os
from app.routes import health, auth, property, room, tenant, bed, subscription, dashboard, staff, payment, coupon, plan
from app.utils.rate_limit import limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from app.utils.exception_handlers import add_global_exception_handlers
from app.middleware.user_context import UserContextMiddleware
from app.middleware.timing_middleware import TimingMiddleware

# Configure logging for APScheduler
logging.basicConfig()
scheduler_logger = logging.getLogger('apscheduler.executors.default')
scheduler_logger.setLevel(logging.INFO)

# Ensure 'static' directory exists
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if not os.path.exists(static_dir):
    os.makedirs(static_dir)

# FastAPI lifespan event handler for startup tasks
async def ensure_mongodb_connection():
    """Return a concise startup error message if MongoDB is unreachable."""
    logger = logging.getLogger(__name__)
    mongo_url = os.getenv("MONGO_URL", "")

    if not mongo_url:
        return "MongoDB startup check failed: MONGO_URL is not set. Configure it in api/.env before starting the API."

    try:
        await db.command("ping")
        return None
    except ServerSelectionTimeoutError:
        parsed = urlparse(mongo_url)
        hostname = parsed.hostname or ""
        hint = ""
        if hostname == "mongodb":
            hint = " Hint: 'mongodb' hostname works inside Docker network; for local uvicorn use localhost in MONGO_URL."
        logger.error("MongoDB startup check failed: cannot connect to MongoDB server.")
        return (
            "MongoDB startup check failed: unable to connect. Ensure MongoDB is running and MONGO_URL points to a reachable host."
            f"{hint}"
        )
    except Exception as exc:
        logger.error(f"MongoDB startup check failed: {exc}")
        return f"MongoDB startup check failed: {exc}"


async def ensure_indexes():
    """Create essential indexes for production-grade queries."""
    logger = logging.getLogger(__name__)

    def _to_key_pattern(keys):
        if isinstance(keys, str):
            return {keys: 1}
        if isinstance(keys, tuple):
            if len(keys) == 2 and isinstance(keys[0], str):
                return {keys[0]: keys[1]}
            keys = [keys]
        if isinstance(keys, list):
            return {field: order for field, order in keys}
        raise ValueError(f"Unsupported index key format: {keys}")
    
    async def create_index_safe(collection, keys, **kwargs):
        """Safely create an index, handling existing/conflicting index specs."""
        try:
            await db[collection].create_index(keys, **kwargs)
        except OperationFailure as e:
            # Index already exists with same or overlapping key specs.
            # code 86: IndexKeySpecsConflict, code 85: IndexOptionsConflict.
            if e.code in (85, 86):
                ttl_value = kwargs.get("expireAfterSeconds")
                if ttl_value is not None:
                    try:
                        await db.command({
                            "collMod": collection,
                            "index": {
                                "keyPattern": _to_key_pattern(keys),
                                "expireAfterSeconds": ttl_value,
                            },
                        })
                        logger.info(
                            "Updated TTL index on %s for %s to %s seconds",
                            collection,
                            keys,
                            ttl_value,
                        )
                        return
                    except OperationFailure as mod_err:
                        logger.warning(
                            "Could not update TTL index via collMod on %s for %s: %s",
                            collection,
                            keys,
                            mod_err,
                        )
                logger.debug(f"Index already exists on {collection} for {keys}, skipping")
                return
            raise
    
    # ============ USERS COLLECTION ============
    await create_index_safe("users", "email", unique=True)
    await create_index_safe("users", "createdAt")
    await create_index_safe("users", "phone")
    logger.info("✓ Users indexes created")
    
    # ============ TOKEN BLACKLIST COLLECTION ============
    await create_index_safe("token_blacklist", "token")
    await create_index_safe("token_blacklist", "createdAt", expireAfterSeconds=60*60*24*31)
    logger.info("✓ Token blacklist indexes created")
    
    # ============ PROPERTIES COLLECTION ============
    await create_index_safe("properties", "ownerIds")
    await create_index_safe("properties", "createdAt")
    await create_index_safe("properties", "active")
    await create_index_safe("properties", [("ownerIds", 1), ("active", 1)])
    logger.info("✓ Properties indexes created")
    
    # ============ ROOMS COLLECTION ============
    await create_index_safe("rooms", "propertyId")
    await create_index_safe("rooms", "active")
    await create_index_safe("rooms", [("propertyId", 1), ("active", 1)])
    logger.info("✓ Rooms indexes created")
    
    # ============ BEDS COLLECTION ============
    await create_index_safe("beds", "propertyId")
    await create_index_safe("beds", "roomId")
    await create_index_safe("beds", "status")
    await create_index_safe("beds", [("propertyId", 1), ("status", 1)])
    logger.info("✓ Beds indexes created")
    
    # ============ TENANTS COLLECTION ============
    await create_index_safe("tenants", "propertyId")
    await create_index_safe("tenants", "bedId")
    await create_index_safe("tenants", "status")
    await create_index_safe("tenants", [("propertyId", 1), ("autoGeneratePayments", 1)])
    await create_index_safe("tenants", [("propertyId", 1), ("status", 1)])
    logger.info("✓ Tenants indexes created")
    
    # ============ PAYMENTS COLLECTION ============
    await create_index_safe("payments", "propertyId")
    await create_index_safe("payments", "tenantId")
    await create_index_safe("payments", "status")
    await create_index_safe("payments", "dueDate")
    await create_index_safe("payments", [("propertyId", 1), ("status", 1)])
    # Unique index to prevent duplicate payments (non-sparse to enforce uniqueness)
        # Additional compound index for common tenant queries
    await create_index_safe("tenants", [("propertyId", 1), ("billingConfig.status", 1)])
    # Text search index for tenant search functionality
    try:
        await create_index_safe("tenants", [("name", "text"), ("phone", "text"), ("documentId", "text")])
    except Exception:
        pass  # Text indexes can conflict, skip if already exists
    await create_index_safe("payments", [("tenantId", 1), ("dueDate", 1)], unique=True)
    logger.info("✓ Payments indexes created (including unique tenantId+dueDate)")
    
    # ============ STAFF COLLECTION ============
    await create_index_safe("staff", "propertyId")
    await create_index_safe("staff", "role")
    await create_index_safe("staff", "status")
    await create_index_safe("staff", [("propertyId", 1), ("archived", 1)])
        # Compound index for efficient payment queries by property and due date
    await create_index_safe("payments", [("propertyId", 1), ("dueDate", 1)])
    logger.info("✓ Staff indexes created")
    
    # ============ SUBSCRIPTIONS COLLECTION ============
    await create_index_safe("subscriptions", [("ownerId", 1), ("plan", 1)], unique=True)
    await create_index_safe("subscriptions", "ownerId")
    await create_index_safe("subscriptions", "status")
    await create_index_safe("subscriptions", [("ownerId", 1), ("status", 1)])
    logger.info("✓ Subscriptions indexes created")
    
        # Compound index for room-specific bed queries
    await create_index_safe("beds", [("roomId", 1), ("status", 1)])
    # ============ EMAIL OTP COLLECTION ============
    await create_index_safe("email_otps", "email")
    await create_index_safe("email_otps", "createdAt", expireAfterSeconds=60*10)  # Auto-delete after 10 minutes
    logger.info("✓ Email OTP indexes created (TTL: 10 minutes)")
    
    # ============ OTP ATTEMPTS COLLECTION ============
        # Compound index for room number uniqueness checks
    await create_index_safe("rooms", [("propertyId", 1), ("roomNumber", 1)])
    await create_index_safe("otp_attempts", "email")
    await create_index_safe("otp_attempts", "createdAt", expireAfterSeconds=60*60)  # Auto-delete after 1 hour
    logger.info("✓ OTP Attempts indexes created (TTL: 1 hour)")
    
    # ============ RAZORPAY ORDERS COLLECTION ============
    await create_index_safe("razorpay_orders", "order_id", unique=True)
    await create_index_safe("razorpay_orders", "propertyId")
        # Text search index for property search
    try:
        await create_index_safe("properties", [("name", "text"), ("address", "text")])
    except Exception:
        pass  # Text indexes can conflict, skip if already exists
    await create_index_safe("razorpay_orders", "createdAt")
    logger.info("✓ Razorpay Orders indexes created")
    
    # ============ COUPONS COLLECTION ============
    await create_index_safe("coupons", "code", unique=True)
    await create_index_safe("coupons", "isActive")
    await create_index_safe("coupons", "expiresAt")
    await create_index_safe("coupons", "createdAt")
    logger.info("✓ Coupons indexes created")
    
    # ============ PLANS COLLECTION ============
    await create_index_safe("plans", "name", unique=True)
    await create_index_safe("plans", "isActive")
    await create_index_safe("plans", "sort_order")
    await create_index_safe("plans", "createdAt")
    logger.info("✓ Plans indexes created")


@asynccontextmanager
async def lifespan(app):
    mongo_error = await ensure_mongodb_connection()
    if mongo_error:
        print(mongo_error)
        os._exit(1)

    await ensure_indexes()
    
    # Initialize default subscription plans (idempotent - only creates if none exist)
    from app.services.plan_service import PlanService
    logger = logging.getLogger(__name__)
    
    plans_created = await PlanService.create_default_plans()
    if plans_created > 0:
        logger.info(f"✓ Created {plans_created} default subscription plans (free, pro, premium)")
    else:
        logger.info("✓ Subscription plans already exist")
    
    # Initialize APScheduler for background jobs
    scheduler = AsyncIOScheduler()
    
    # Import here to avoid circular imports
    from app.services.tenant_service import TenantService
    from app.services.razorpay_subscription_service import RazorpaySubscriptionService
    tenant_service = TenantService()
    
    # Wrapper for scheduled job to add logging
    async def generate_payments_job():
        result = await tenant_service.generate_monthly_payments()
        # Result already contains timing info - logged by service
        return result
    
    # Wrapper for auto-renewal job
    async def auto_renewal_job():
        result = await RazorpaySubscriptionService.check_and_renew_subscriptions()
        return result
    
    # Wrapper for database cleanup job
    async def db_cleanup_job():
        """Cleanup expired OTPs and old attempt records."""
        logger = logging.getLogger(__name__)
        now = datetime.now(timezone.utc)
        
        # 1. Cleanup expired OTPs (older than 10 minutes)
        otp_expiry = now - timedelta(minutes=10)
        # Assuming collections exist based on PRODUCTION_TODOS.md
        await db["email_otps"].delete_many({"createdAt": {"$lt": otp_expiry}})
        await db["password_reset_otps"].delete_many({"createdAt": {"$lt": otp_expiry}})
        
        # 2. Cleanup old attempt records (older than 24 hours)
        attempt_expiry = now - timedelta(hours=24)
        await db["login_attempts"].delete_many({"updatedAt": {"$lt": attempt_expiry}})
        await db["otp_attempts"].delete_many({"updatedAt": {"$lt": attempt_expiry}})
        
        logger.info(f"✓ Database cleanup completed at {now}")

    # Wrapper for cleanup of expired archived resources
    async def cleanup_expired_archives_job():
        """Cleanup permanently deleted archived resources after 30-day grace period."""
        from app.services.subscription_lifecycle import SubscriptionLifecycle
        logger = logging.getLogger(__name__)
        try:
            await SubscriptionLifecycle.cleanup_expired_archives()
            logger.info(f"✓ Expired archives cleanup completed at {datetime.now(timezone.utc)}")
        except Exception as e:
            logger.error(f"Error during expired archives cleanup: {str(e)}")

    # Job 1: Generate monthly payments daily at 00:05 UTC
    # This ensures all tenants get their monthly payment created on the same day
    scheduler.add_job(
        generate_payments_job,
        trigger=CronTrigger(hour=0, minute=5, timezone="UTC"),
        id="generate_monthly_payments",
        name="Generate monthly payments for tenants",
        replace_existing=True,
        max_instances=1,  # Prevent concurrent executions
        coalesce=True,     # Skip missed runs if delayed
        misfire_grace_time=300  # Allow 5min grace period
    )
    
    # Job 2: Check and renew subscriptions daily at 01:00 UTC
    # This checks for subscriptions expiring within 7 days and initiates renewal
    scheduler.add_job(
        auto_renewal_job,
        trigger=CronTrigger(hour=1, minute=0, timezone="UTC"),
        id="auto_renewal_subscriptions",
        name="Check and renew expiring subscriptions",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300
    )

    # Job 3: Database cleanup every hour
    scheduler.add_job(
        db_cleanup_job,
        trigger="interval",
        hours=1,
        id="db_cleanup",
        name="Cleanup expired OTPs and old attempt records",
        replace_existing=True,
        max_instances=1,
        coalesce=True
    )

    # Job 4: Cleanup expired archives daily at 02:00 UTC
    # Runs after subscription renewal check (01:00 UTC) to handle any newly-expired resources
    scheduler.add_job(
        cleanup_expired_archives_job,
        trigger=CronTrigger(hour=2, minute=0, timezone="UTC"),
        id="cleanup_expired_archives",
        name="Cleanup permanently deleted archived resources after 30-day grace",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300
    )
    
    scheduler.start()
    app.state.scheduler = scheduler
    
    logger.info("✓ Background scheduler initialized")
    logger.info("✓ Jobs registered: generate_monthly_payments, auto_renewal_subscriptions, db_cleanup, cleanup_expired_archives")
    
    yield
    
    # Shutdown scheduler
    scheduler.shutdown()
    logger.info("✓ Background scheduler shut down")



app = FastAPI(lifespan=lifespan)
# Enable response compression for better performance (reduces bandwidth by 60-80%)
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add timing middleware to track slow requests
app.add_middleware(TimingMiddleware)

app.add_middleware(UserContextMiddleware)
app.mount("/static", StaticFiles(directory=static_dir), name="static")
enforce_https = os.getenv("ENFORCE_HTTPS", "False").lower() == "true"
if enforce_https:
    app.add_middleware(HTTPSRedirectMiddleware)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda request, exc: JSONResponse(status_code=429, content={"detail": "Too many requests. Please try again later."}))
app.add_middleware(SlowAPIMiddleware)

# Production-safe CORS setup
allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if not allowed_origins_env:
    raise RuntimeError("ALLOWED_ORIGINS environment variable must be set for production-safe CORS.")
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
if not allowed_origins:
    raise RuntimeError("ALLOWED_ORIGINS must specify at least one domain.")

# Only allow credentials if needed (e.g., cookies, auth headers)
allow_credentials = os.getenv("ALLOW_CREDENTIALS", "False").lower() == "true"

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
API_PREFIX = "/api/v1"



app.include_router(health.router, prefix=API_PREFIX)
app.include_router(auth.router, prefix=API_PREFIX)

from app.routes import payment
app.include_router(property.router, prefix=API_PREFIX)
app.include_router(room.router, prefix=API_PREFIX)
app.include_router(tenant.router, prefix=API_PREFIX)
app.include_router(bed.router, prefix=API_PREFIX)
app.include_router(staff.router, prefix=API_PREFIX)
app.include_router(payment.router, prefix=API_PREFIX)
app.include_router(subscription.router, prefix=API_PREFIX)
app.include_router(coupon.router, prefix=API_PREFIX)
app.include_router(plan.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)


@app.get("/", tags=["root"])
async def root():
    return {"message": "Hostel API is running"}


# Register global exception handlers
add_global_exception_handlers(app)