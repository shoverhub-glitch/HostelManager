from datetime import datetime, timezone, timedelta
from bson import ObjectId
from jose import JWTError, jwt
from fastapi import HTTPException, status, Request
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
import time
import logging

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
logger = logging.getLogger(__name__)

PASSWORD_MIN_LENGTH = 8


def validate_password_strength(password: str) -> str | None:
    if len(password) < PASSWORD_MIN_LENGTH:
        return f"Password must be at least {PASSWORD_MIN_LENGTH} characters long"
    if not re.search(r"[A-Z]", password):
        return "Password must contain at least one uppercase letter"
    if not re.search(r"[a-z]", password):
        return "Password must contain at least one lowercase letter"
    if not re.search(r"\d", password):
        return "Password must contain at least one number"
    if not re.search(r"[^\w\s]", password):
        return "Password must contain at least one special character"
    return None


def validate_indian_phone(phone: str) -> bool:
    """Validate Indian phone numbers (+91 followed by 10 digits)"""
    pattern = r'^\+91[6-9]\d{9}$'
    return bool(re.match(pattern, phone.strip()))


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

    password_error = validate_password_strength(user.password)
    if password_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    # SECURITY: Check if email is verified - REQUIRED for registration
    # This blocks direct API attacks without OTP verification
    otp_doc = await email_otp_collection.find_one({"email": normalized_email, "verified": True})
    if not otp_doc:
        # Log security event for audit trail
        logger.warning("Registration attempted without email verification")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email verification required. Please complete OTP verification first."
        )

    # SECURITY: Verify email verification is still fresh (within 6 minutes)
    now = datetime.now(timezone.utc)
    verification_time = otp_doc.get("verifiedAt") or otp_doc.get("updatedAt") or otp_doc.get("createdAt")
    if not verification_time:
        logger.warning("Missing verification timestamp during registration")
        await email_otp_collection.delete_one({"email": normalized_email})
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token expired. Please request a new OTP."
        )

    if verification_time.tzinfo is None:
        verification_time = verification_time.replace(tzinfo=timezone.utc)

    age_minutes = (now - verification_time).total_seconds() / 60
    # OTP expires in 5 minutes, so require verification within 6 minutes to be safe
    if age_minutes > 6:
        logger.warning("Registration verification window expired")
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
        "isEmailVerified": True,
        "isDeleted": False,
        "lastLogin": None,
        "createdAt": now,
        "updatedAt": now,
        "propertyIds": [],
    }

    result = await users_collection.insert_one(user_doc)
    user_id = str(result.inserted_id)
    
    # Create single free subscription document (upgraded in place when user selects a plan)
    from app.services.subscription_service import SubscriptionService
    await SubscriptionService.create_default_subscriptions(user_id)
    
    # SECURITY: Delete the verification record after successful registration
    # Prevents reuse of same verification for multiple registrations
    await email_otp_collection.delete_one({"email": normalized_email})
    await delete_otp_attempts(normalized_email)
    
    logger.info("User registration successful", extra={"user_id": user_id})
    response = _build_auth_payload(user_doc, user_id)
    return JSONResponse(status_code=status.HTTP_201_CREATED, content={"data": response})


async def login_user_service(data: UserLogin):
    # SECURITY: Normalize email to prevent case/whitespace bypasses
    normalized_email = data.email.strip().lower()
    
    # SECURITY: Check if account is locked due to failed attempts
    is_locked, minutes_remaining = await check_login_attempts(normalized_email)
    if is_locked:
        logger.warning("Login blocked due to temporary lockout")
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
            logger.warning("Failed login attempt (password mismatch)")
        else:
            logger.warning("Failed login attempt (unknown email)")
        
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
        logger.warning("Login attempt on deleted account")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is no longer available")

    if user.get("isDisabled"):
        logger.warning("Login attempt on disabled account")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account has been disabled. Contact support.")

    # Check if account requires email verification (optional for some users)
    if user.get("requiresEmailVerification") and not user.get("isEmailVerified"):
        logger.warning("Login attempt on unverified account")
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
    logger.info("User login successful", extra={"user_id": user_id})
    
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
        logger.warning("Re-registration attempt blocked for existing email", extra={"auth_provider": auth_provider})
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
    
    # If a stale verified marker exists from an incomplete flow, clear it and force fresh OTP verification.
    existing_otp = await email_otp_collection.find_one({"email": normalized_email, "verified": True})
    if existing_otp:
        await email_otp_collection.delete_one({"email": normalized_email})

    # Reset failed OTP attempts when issuing a fresh code.
    await delete_otp_attempts(normalized_email)
    
    # Generate OTP and store in memory
    otp, is_new = await generate_and_store_otp(normalized_email, "registration")

    if settings.DEMO_MODE:
        logger.info("DEMO MODE: OTP not sent via email", extra={"otp": otp})
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "data": {
                    "message": f"Demo OTP: {settings.DEMO_OTP} (use this to verify)"
                }
            },
        )
    
    # Send OTP via Zoho Zepto Mail
    email_sent = await send_otp_email(normalized_email, otp)


    
    if not email_sent:
        await delete_otp(normalized_email)
        logger.error("Failed to send registration OTP email")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send OTP right now. Please try again shortly."
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "OTP sent successfully to your email. It expires in 5 minutes.",
            }
        },
    )


async def verify_email_otp_service(email: str, otp: str, otp_type: str = "registration"):
    """Verify OTP sent to email during registration or password reset"""
    if not email or not otp:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email and OTP are required")

    normalized_email = email.strip().lower()

    is_locked, minutes_remaining = await check_otp_attempts(normalized_email)
    if is_locked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed OTP attempts. Please try again in {minutes_remaining} minutes."
        )

    # Verify OTP using in-memory store
    is_valid, error_message = await verify_otp(normalized_email, otp, otp_type=otp_type)
    if not is_valid:
        failed_count = await increment_otp_attempts(normalized_email)
        if failed_count >= 5:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many failed OTP attempts. Please request a new OTP after 10 minutes"
            )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_message)

    await reset_otp_attempts(normalized_email)

    if otp_type == "registration":
        # Mark OTP as verified in registration flow
        await mark_otp_verified(normalized_email)
        
        # Also update database for registration flow (to check if email is verified)
        now = datetime.now(timezone.utc)
        await email_otp_collection.update_one(
            {"email": normalized_email},
            {
                "$set": {
                    "verified": True,
                    "verifiedAt": now,
                    "updatedAt": now
                },
                "$setOnInsert": {
                    "createdAt": now,
                },
            },
            upsert=True,
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "OTP verified successfully",
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
    await delete_otp_attempts(normalized_email)
    if settings.DEMO_MODE:
        logger.info("DEMO MODE: Password reset OTP bypassed")
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "data": {
                    "message": f"Demo OTP: {settings.DEMO_OTP}"
                }
            },
        )

    # Send OTP via Zoho Zepto Mail
    email_sent = await send_otp_email(
        normalized_email,
        otp,
        app_name="Hostel Manager",
        otp_type="password_reset",
    )
    
    if not email_sent:
        await delete_otp(normalized_email)
        logger.error("Failed to send password reset OTP email")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to send password reset OTP right now. Please try again shortly."
        )

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

    password_error = validate_password_strength(new_password)
    if password_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    # Verify OTP using in-memory store
    is_valid, error_message = await verify_otp(normalized_email, otp, otp_type="password_reset")
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
    await delete_otp_attempts(normalized_email)

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "Password reset successfully. Please log in with your new password.",
                "success": True
            }
        },
    )


async def change_password_service(request: Request, old_password: str, new_password: str):
    """Change password for the currently authenticated user."""
    if not old_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Old password and new password are required"
        )

    password_error = validate_password_strength(new_password)
    if password_error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=password_error)

    if old_password == new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from old password"
        )

    current_user = getattr(request.state, "current_user", None)
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    user_id = current_user.get("_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

    user = await users_collection.find_one({"_id": user_id})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.get("isDeleted"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deleted")

    if not verify_password(old_password, user.get("password", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Old password is incorrect")

    now = datetime.now(timezone.utc)
    await users_collection.update_one(
        {"_id": user_id},
        {
            "$set": {
                "password": hash_password(new_password),
                "updatedAt": now,
            }
        },
    )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "data": {
                "message": "Password changed successfully",
                "success": True,
            }
        },
    )
