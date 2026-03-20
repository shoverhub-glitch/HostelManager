from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from app.database.mongodb import db
from bson import ObjectId
from app.utils.ownership import build_owner_query
from jose import jwt
from fastapi import HTTPException, status
from app.config import settings
import logging
from jose import JWTError, ExpiredSignatureError
from starlette.responses import JSONResponse
from app.database.token_blacklist import is_token_blacklisted

class UserContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        SECRET_KEY = settings.JWT_SECRET
        ALGORITHM = settings.JWT_ALGORITHM
        user_id = None
        user = None
        role = None
        property_ids = []
        subscription = None
        auth_header = request.headers.get("Authorization")
        logger = logging.getLogger("uvicorn.error")

        # Read public endpoints from environment variable PUBLIC_PATHS (comma-separated)
        public_paths = {p.strip() for p in settings.PUBLIC_PATHS.split(",") if p.strip()}
        v_prefix = f"/api/{settings.API_VERSION}"
        
        public_paths.update({
            "/",
            f"{v_prefix}/health",
            f"{v_prefix}/auth/login",
            f"{v_prefix}/auth/register",
            f"{v_prefix}/auth/email/send-otp",
            f"{v_prefix}/auth/email/verify-otp",
            f"{v_prefix}/auth/email/resend-otp",
            f"{v_prefix}/auth/forgot-password",
            f"{v_prefix}/auth/verify-reset-otp",
            f"{v_prefix}/auth/reset-password",
            f"{v_prefix}/auth/refresh",
            f"{v_prefix}/auth/logout",  # Logout only needs refresh token, not access token
            f"{v_prefix}/subscription/limits/free",  # Plan limits are public
            f"{v_prefix}/subscription/limits/pro",
            f"{v_prefix}/subscription/limits/premium",
            f"{v_prefix}/subscription/plans",  # Get all available plans
        })
        
        # Public path prefixes (for paths with dynamic segments)
        public_prefixes = [
            f"{v_prefix}/coupons/validate/",  # Coupon validation is public
        ]
        
        # Check exact path match or prefix match
        is_public = request.url.path in public_paths or any(
            request.url.path.startswith(prefix) for prefix in public_prefixes
        )

        # Safety guard: admin namespaces must never be public even if env is misconfigured.
        if request.url.path.startswith(f"{v_prefix}/admin") or request.url.path.startswith(f"{v_prefix}/coupons/admin"):
            is_public = False
        
        if is_public:
            # Allow public access, skip authentication
            response = await call_next(request)
            return response

        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ", 1)[1]
            try:
                if await is_token_blacklisted(token):
                    logger.info("Rejected blacklisted token")
                    return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Token has been revoked"})

                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                if payload.get("type") != "access":
                    logger.warning("Rejected non-access token on protected endpoint")
                    return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid token type"})

                user_id = payload.get("sub")
                if user_id is None:
                    logger.warning("JWT missing 'sub' claim.")
                    return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid authentication credentials"})
                user = await db["users"].find_one({"_id": ObjectId(user_id)})
                if user:
                    if user.get("isDeleted") or user.get("isDisabled"):
                        logger.warning("Rejected token for deleted/disabled user")
                        return JSONResponse(status_code=status.HTTP_403_FORBIDDEN, content={"detail": "Account is not active"})

                    role = user.get("role")
                    owned_properties = await db["properties"].find(
                        build_owner_query(user_id),
                        {"_id": 1}
                    ).to_list(length=None)
                    property_ids = [str(doc["_id"]) for doc in owned_properties]
                    # Sanitize user object (remove sensitive fields)
                    user = {k: v for k, v in user.items() if k not in ["password", "hashed_password"]}
            except ExpiredSignatureError:
                logger.info(f"Expired JWT for user_id: {user_id}")
                return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Your session has expired. Please log in again or refresh your token."})
            except JWTError as e:
                logger.warning(f"JWT error: {str(e)}")
                return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Invalid authentication credentials"})
            except Exception as e:
                logger.error(f"Unexpected error in UserContextMiddleware: {str(e)}")
                return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content={"detail": "Internal server error"})
        else:
            logger.warning("Missing or invalid Authorization header.")
            return JSONResponse(status_code=status.HTTP_401_UNAUTHORIZED, content={"detail": "Missing or invalid Authorization header"})
        
        # Load subscription info
        if user_id:
            from app.services.subscription_service import SubscriptionService
            try:
                subscription = await SubscriptionService.get_subscription(user_id)
            except Exception as e:
                logger.warning(f"Failed to load subscription for {user_id}: {e}")
                subscription = None
        
        # Attach metadata to request.state
        request.state.user_id = user_id
        request.state.role = role
        request.state.property_ids = property_ids
        request.state.current_user = user
        request.state.subscription = subscription
        response = await call_next(request)
        return response


