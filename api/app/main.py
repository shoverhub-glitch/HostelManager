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
import logging
from pymongo.errors import OperationFailure

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
async def ensure_indexes():
    """Create essential indexes for production-grade queries."""
    logger = logging.getLogger(__name__)
    
    async def create_index_safe(collection, keys, **kwargs):
        """Safely create an index, ignoring conflicts with existing indexes."""
        try:
            db[collection].create_index(keys, **kwargs)
        except OperationFailure as e:
            # IndexKeySpecsConflict (code 86) means the index already exists with different specs
            # This is safe to ignore - the index was already created
            if e.code == 86:
                logger.debug(f"Index already exists on {collection} for {keys}, skipping")
            else:
                raise
    
    # ============ USERS COLLECTION ============
    await create_index_safe("users", "email", unique=True)
    await create_index_safe("users", "createdAt")
    await create_index_safe("users", "phone")
    logger.info("✓ Users indexes created")
    
    # ============ TOKEN BLACKLIST COLLECTION ============
    await create_index_safe("token_blacklist", "createdAt", expireAfterSeconds=60*60*24*7)
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
    
    scheduler.start()
    app.state.scheduler = scheduler
    
    logger.info("✓ Background scheduler initialized")
    logger.info("✓ Jobs registered: generate_monthly_payments (daily at 00:05 UTC), auto_renewal_subscriptions (daily at 01:00 UTC)")
    
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


# Register global exception handlers
add_global_exception_handlers(app)