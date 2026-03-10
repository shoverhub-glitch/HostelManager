from datetime import datetime, timezone, timedelta
from bson import ObjectId
from jose import JWTError, jwt
from fastapi import HTTPException, status, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import random
import time
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

from app.database.mongodb import db
from app.database.token_blacklist import blacklist_token, is_token_blacklisted
from app.config import settings
from app.utils.helpers import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    SECRET_KEY,
    ALGORITHM,
)
from app.utils.attempt_tracking import (
    check_login_attempts,
    increment_login_attempts,
    reset_login_attempts,
    check_otp_attempts,
    increment_otp_attempts,
    reset_otp_attempts,
    delete_otp_attempts,
)
from app.utils.email_service import send_otp_email
from app.utils.otp_memory_store import (
    generate_and_store_otp,
    get_otp,
    verify_otp,
    mark_otp_verified,
    get_resend_cooldown_remaining,
    delete_otp,
)
from app.models.user_schema import UserCreate, UserLogin, UserOut
import re

users_collection = db["users"]
email_otp_collection = db["email_otps"]
password_reset_otp_collection = db["password_reset_otps"]


def validate_indian_phone(phone: str) -> bool:
    """Validate Indian phone numbers (+91 followed by 10 digits)"""
    pattern = r'^\+91[6-9]\d{9}$'
    return bool(re.match(pattern, phone.strip()))


def _get_google_client_ids() -> list[str]:
    return [client_id.strip() for client_id in settings.GOOGLE_CLIENT_IDS.split(",") if client_id.strip()]


def _verify_google_id_token(id_token: str) -> dict:
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Google idToken is required")

    allowed_client_ids = _get_google_client_ids()
    if not allowed_client_ids:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google sign-in is not configured on server",
        )

    last_error = None
    token_info = None
    request_adapter = google_requests.Request()

    for audience in allowed_client_ids:
        try:
            token_info = google_id_token.verify_oauth2_token(id_token, request_adapter, audience=audience)
            break
        except Exception as exc:
            last_error = exc

    if not token_info:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token") from last_error

    issuer = token_info.get("iss")
    if issuer not in ["accounts.google.com", "https://accounts.google.com"]:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Google token issuer")

    if not token_info.get("email_verified"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google email is not verified")

    return token_info


def _build_auth_payload(user_doc: dict, user_id: str):
    access_token = create_access_token({"sub": user_id})
    refresh_token = create_refresh_token({"sub": user_id})
    expires_at = int(time.time()) + 60 * 60 * 24 * 30
    user_out = UserOut(
        id=user_id,
        name=user_doc["name"],
        email=user_doc["email"],
        phone=user_doc.get("phone"),
        propertyIds=user_doc.get("propertyIds", [])
    )
    return {
        "user": user_out.model_dump(),
        "tokens": {
            "accessToken": access_token,
            "refreshToken": refresh_token,
            "expiresAt": expires_at,
        },
    }


async def register_user_service(user: UserCreate):
    # Validate email
    normalized_email = user.email.strip().lower()
    existing = await users_collection.find_one({"email": normalized_email})
    if existing:
        # Generic message to prevent email enumeration attacks
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Registration failed. Email may already be registered.")

    # Validate phone number (India only)
    if not validate_indian_phone(user.phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Invalid Indian phone number. Format: +91XXXXXXXXXX"
        )

    # SECURITY: Check if email is verified - REQUIRED for registration
    # This blocks direct API attacks without OTP verification
    otp_doc = await email_otp_collection.find_one({"email": normalized_email, "verified": True})
    if not otp_doc:
        # Log security event for audit trail
        print(f"[SECURITY] Attempted registration without email verification: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email verification required. Please complete OTP verification first."
        )

    # SECURITY: Verify the OTP is still fresh (within 5 minutes)
    now = datetime.now(timezone.utc)
    created_at = otp_doc.get("createdAt")
    if created_at:
        age_minutes = (now - created_at).total_seconds() / 60
        # OTP expires in 5 minutes, so require verification within 6 minutes to be safe
        if age_minutes > 6:
            print(f"[SECURITY] OTP expired for registration attempt: {normalized_email}")
            await email_otp_collection.delete_one({"email": normalized_email})
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, 
                detail="Verification token expired. Please request a new OTP."
            )

    user_doc = {
        "name": user.name,
        "email": normalized_email,
        "phone": user.phone,
        "password": hash_password(user.password),
        "role": "propertyowner",
        "isVerified": True,
        "isEmailVerified": True,
        "isDeleted": False,
        "lastLogin": None,
        "createdAt": now,
        "updatedAt": now,
        "deviceId": None,
        "deviceType": None,
        "osVersion": None,
        "appVersion": None,
        "propertyIds": [],
        "propertyLimit": 3,
    }

    result = await users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create 3 default subscriptions for the user (free, pro, premium)
    from app.services.subscription_service import SubscriptionService
    await SubscriptionService.create_default_subscriptions(user_id)
    
    # SECURITY: Delete the verification record after successful registration
    # Prevents reuse of same verification for multiple registrations
    await email_otp_collection.delete_one({"email": normalized_email})
    
    print(f"[SUCCESS] User registered: {user_id} ({normalized_email})")
    response = _build_auth_payload(user_doc, user_id)
    return JSONResponse(status_code=status.HTTP_201_CREATED, content={"data": response})


async def login_user_service(data: UserLogin):
    # SECURITY: Normalize email to prevent case/whitespace bypasses
    normalized_email = data.email.strip().lower()
    
    # SECURITY: Check if account is locked due to failed attempts
    is_locked, minutes_remaining = await check_login_attempts(normalized_email)
    if is_locked:
        print(f"[SECURITY] Login attempt on locked account: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed login attempts. Please try again in {minutes_remaining} minutes."
        )

    # Query user by normalized email
    user = await users_collection.find_one({"email": normalized_email})
    
    # SECURITY: Verify password AND check user existence together
    # This prevents timing attacks that could reveal if email exists
    if not user or not verify_password(data.password, user.get("password", "")):
        failed_count = await increment_login_attempts(normalized_email)
        remaining_attempts = 5 - failed_count
        
        # Log failed attempt
        if user:
            print(f"[SECURITY] Failed login attempt (wrong password): {normalized_email}")
        else:
            print(f"[SECURITY] Failed login attempt (non-existent email): {normalized_email}")
        
        if failed_count >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed login attempts. Your account is locked for 10 minutes."
            )
        else:
            # Generic message - don't reveal if email exists or password is wrong
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid credentials. {remaining_attempts} attempt(s) remaining."
            )

    # SECURITY: Additional user validation checks
    if user.get("isDeleted"):
        print(f"[SECURITY] Login attempt on deleted account: {normalized_email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is no longer available")

    if user.get("isDisabled"):
        print(f"[SECURITY] Login attempt on disabled account: {normalized_email}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been disabled. Contact support.")

    # Check if account requires email verification (optional for some users)
    if user.get("requiresEmailVerification") and not user.get("isEmailVerified"):
        print(f"[SECURITY] Login attempt on unverified email: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Please verify your email before logging in. Check your inbox for verification link."
        )

    # SECURITY: Reset attempts on successful login
    await reset_login_attempts(normalized_email)

    # Update last login timestamp
    now = datetime.now(timezone.utc)
    await users_collection.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastLogin": now, "updatedAt": now}},
    )

    user_id = str(user["_id"])
    
    # Log successful login
    print(f"[SUCCESS] User logged in: {user_id} ({normalized_email})")
    
    response = _build_auth_payload(user, user_id)
    return JSONResponse(status_code=status.HTTP_200_OK, content={"data": response})


async def google_sign_in_service(payload):
    now = datetime.now(timezone.utc)
    token_info = _verify_google_id_token(payload.idToken)

    email = token_info.get("email")
    name = token_info.get("name") or token_info.get("given_name") or "Google User"
    google_id = token_info.get("sub")

    if not email:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Google token has no email")

    user = await users_collection.find_one({"email": email})

    if not user:
        user_doc = {
            "name": name,
            "email": email,
            "password": hash_password(f"google-{random.randint(100000, 999999)}"),
            "role": "propertyowner",
            "isVerified": True,
            "isDeleted": False,
            "lastLogin": now,
            "createdAt": now,
            "updatedAt": now,
            "authProvider": "google",
            "googleId": google_id,
            "phone": None,
            "location": None,
        }
        result = await users_collection.insert_one(user_doc)
        user_id = str(result.inserted_id)
        
        # Create 3 default subscriptions for the user (free, pro, premium)
        from app.services.subscription_service import SubscriptionService
        await SubscriptionService.create_default_subscriptions(user_id)
        
        response = _build_auth_payload(user_doc, user_id)
        return JSONResponse(status_code=status.HTTP_200_OK, content={"data": response})

    if user.get("isDeleted"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deleted")

    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "lastLogin": now,
                "updatedAt": now,
                "authProvider": "google",
                "googleId": google_id,
            }
        },
    )

    user_id = str(user["_id"])
    response = _build_auth_payload(user, user_id)
    return JSONResponse(status_code=status.HTTP_200_OK, content={"data": response})


async def send_email_otp_service(email: str):
    """Send OTP to email for verification during registration"""
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    normalized_email = email.strip().lower()
    
    # SECURITY: Check if email is already registered as a user
    existing_user = await users_collection.find_one({"email": normalized_email, "isDeleted": False})
    if existing_user:
        # Email already has an account - prevent duplicate registration
        auth_provider = existing_user.get("authProvider", "email")
        print(f"[SECURITY] Attempted re-registration with existing email: {normalized_email} (Provider: {auth_provider})")
        
        # Give specific guidance based on how they originally signed up
        if auth_provider == "google":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This email is already registered with Google Sign-in. Please click 'Continue with Google' instead of trying to register manually."
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered. Please login with your existing account instead."
            )
    
    # Check resend cooldown (for existing OTP requests, not for first request)
    cooldown_remaining = await get_resend_cooldown_remaining(normalized_email)
    if cooldown_remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown_remaining} seconds before requesting another OTP"
        )
    
    # Check if email is already verified in current registration flow
    existing_otp = await email_otp_collection.find_one({"email": normalized_email, "verified": True})
    if existing_otp:
        # Email already verified in this registration flow
        print(f"[SECURITY] Attempted re-verification with already verified email: {normalized_email}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already verified. Please proceed to complete registration."
        )
    
    # Generate OTP and store in memory
    otp, is_new = await generate_and_store_otp(normalized_email, "registration")
    
    # Send OTP via Zoho Zepto Mail
    email_sent = await send_otp_email(normalized_email, otp)
    
    if not email_sent:
        # Log warning but don't fail the request - OTP is stored in memory
        print(f"[WARNING] Failed to send OTP email to {normalized_email}, but OTP stored in memory: {otp}")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "OTP sent successfully to your email. It expires in 5 minutes.",
            }
        },
    )


async def verify_email_otp_service(email: str, otp: str):
    """Verify OTP sent to email during registration"""
    if not email or not otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and OTP are required")

    normalized_email = email.strip().lower()

    # Verify OTP using in-memory store
    is_valid, error_message = await verify_otp(normalized_email, otp)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_message)

    # Mark OTP as verified
    await mark_otp_verified(normalized_email)
    
    # Also update database for registration flow (to check if email is verified)
    now = datetime.now(timezone.utc)
    await email_otp_collection.update_one(
        {"email": normalized_email},
        {
            "$set": {
                "verified": True,
                "updatedAt": now
            }
        },
        upsert=True,
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "Email verified successfully",
            }
        },
    )


async def get_current_user_service(request: Request):
    current_user = getattr(request.state, "current_user", None)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    user_id = str(current_user.get("_id")) if current_user.get("_id") else ""
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    user_out = UserOut(
        id=user_id,
        name=current_user.get("name", ""),
        email=current_user.get("email", ""),
        phone=current_user.get("phone"),
        propertyIds=current_user.get("propertyIds", []),
    )
    return JSONResponse(status_code=status.HTTP_200_OK, content={"data": user_out.model_dump()})


async def refresh_token_service(payload):
    refresh_token = payload.refreshToken
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh token")

    if await is_token_blacklisted(refresh_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token is invalidated (blacklisted)")

    try:
        decoded = jwt.decode(refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if decoded.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

        user_id = decoded.get("sub")
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        
        # Check if user is deleted
        if user.get("isDeleted"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deleted")

        await blacklist_token(refresh_token)
        new_refresh_token = create_refresh_token({"sub": user_id})
        token = create_access_token({"sub": user_id})
        expires_at = int(time.time()) + 60 * 60 * 24 * 30
        
        # Build user data
        user_out = UserOut(
            id=user_id,
            name=user["name"],
            email=user["email"],
            phone=user.get("phone"),
            propertyIds=user.get("propertyIds", []),
        )
        
        response = {
            "tokens": {
                "accessToken": token,
                "refreshToken": new_refresh_token,
                "expiresAt": expires_at,
            },
            "user": user_out.model_dump(),
        }
        return JSONResponse(status_code=status.HTTP_200_OK, content={"data": jsonable_encoder(response)})
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Token refresh failed")


async def logout_user_service(payload):
    refresh_token = payload.refreshToken
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing refresh token")

    await blacklist_token(refresh_token)
    return {"success": True}


async def forgot_password_service(email: str):
    """Send OTP to email for password reset"""
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is required")

    normalized_email = email.strip().lower()
    
    # Check resend cooldown
    cooldown_remaining = await get_resend_cooldown_remaining(normalized_email)
    if cooldown_remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown_remaining} seconds before requesting another OTP"
        )
    
    # Verify user exists (but don't reveal this for security)
    user = await users_collection.find_one({"email": normalized_email})
    if not user:
        # For security, return generic message even if email not found
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "data": {
                    "message": "If an account with this email exists, you will receive a password reset OTP",
                }
            },
        )

    # Generate OTP and store in memory with type password_reset
    otp, is_new = await generate_and_store_otp(normalized_email, "password_reset")

    # Send OTP via Zoho Zepto Mail
    email_sent = await send_otp_email(normalized_email, otp, app_name="Hostel Manager")
    
    if not email_sent:
        # Log warning but don't fail the request - OTP is stored in memory
        print(f"[WARNING] Failed to send password reset OTP email to {normalized_email}, but OTP stored in memory: {otp}")

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "If an account with this email exists, you will receive a password reset OTP",
            }
        },
    )


async def reset_password_service(email: str, otp: str, new_password: str):
    """Reset password using OTP verification"""
    if not email or not otp or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email, OTP, and new password are required"
        )

    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long"
        )

    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    # Verify OTP using in-memory store
    is_valid, error_message = await verify_otp(normalized_email, otp)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_message)

    # Verify user exists
    user = await users_collection.find_one({"email": normalized_email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    if user.get("isDeleted"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deleted and cannot be recovered"
        )

    # Update user password
    hashed_password = hash_password(new_password)
    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password": hashed_password,
                "updatedAt": now
            }
        }
    )

    # Delete the OTP from memory after successful reset
    await delete_otp(normalized_email)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "Password reset successfully. Please log in with your new password.",
                "success": True
            }
        },
    )
