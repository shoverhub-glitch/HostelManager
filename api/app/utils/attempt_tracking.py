"""
Track failed login and OTP verification attempts to prevent brute force attacks
"""
from datetime import datetime, timezone, timedelta
from app.database.mongodb import db

# Collections for tracking attempts
login_attempts_collection = db["login_attempts"]
otp_attempts_collection = db["otp_attempts"]

MAX_LOGIN_ATTEMPTS = 5
MAX_OTP_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 10


async def check_login_attempts(email: str) -> tuple[bool, int | None]:
    """
    Check if user has exceeded login attempts
    Returns: (is_locked, minutes_remaining)
    """
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)
    
    attempt_doc = await login_attempts_collection.find_one({"email": normalized_email})
    
    if not attempt_doc:
        return False, None
    
    # Check if lockout period has expired
    locked_until = attempt_doc.get("lockedUntil")
    if locked_until:
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        
        if now < locked_until:
            minutes_remaining = int((locked_until - now).total_seconds() / 60)
            return True, minutes_remaining
        else:
            # Lockout period expired, reset attempts
            await login_attempts_collection.update_one(
                {"email": normalized_email},
                {"$set": {"failedAttempts": 0, "lockedUntil": None}}
            )
            return False, None
    
    return False, None


async def increment_login_attempts(email: str) -> int:
    """
    Increment failed login attempts
    Returns: number of failed attempts after incrementing
    """
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)
    
    # 1. Fetch current attempt status
    attempt_doc = await login_attempts_collection.find_one({"email": normalized_email})
    
    # 2. Determine if we should reset the counter
    # If last attempt was more than 10 minutes ago, restart from 1
    if attempt_doc and attempt_doc.get("updatedAt"):
        last_attempt = attempt_doc.get("updatedAt")
        if last_attempt.tzinfo is None:
            last_attempt = last_attempt.replace(tzinfo=timezone.utc)
        
        if now - last_attempt > timedelta(minutes=LOCKOUT_DURATION_MINUTES):
            # Window expired, reset to 1
            await login_attempts_collection.update_one(
                {"email": normalized_email},
                {"$set": {"failedAttempts": 1, "updatedAt": now, "lockedUntil": None}}
            )
            return 1

    # 3. Normal increment within the window
    result = await login_attempts_collection.find_one_and_update(
        {"email": normalized_email},
        {
            "$inc": {"failedAttempts": 1},
            "$set": {"updatedAt": now}
        },
        upsert=True,
        return_document=True
    )
    
    failed_attempts = result.get("failedAttempts", 1)
    
    # Lock account if max attempts reached
    if failed_attempts >= MAX_LOGIN_ATTEMPTS:
        locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        await login_attempts_collection.update_one(
            {"email": normalized_email},
            {"$set": {"lockedUntil": locked_until}}
        )
    
    return failed_attempts


async def reset_login_attempts(email: str):
    """Reset login attempts for successful login"""
    normalized_email = email.strip().lower()
    await login_attempts_collection.update_one(
        {"email": normalized_email},
        {"$set": {"failedAttempts": 0, "lockedUntil": None, "updatedAt": datetime.now(timezone.utc)}}
    )


async def check_otp_attempts(email: str) -> tuple[bool, int | None]:
    """
    Check if user has exceeded OTP verification attempts
    Returns: (is_locked, minutes_remaining)
    """
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)
    
    attempt_doc = await otp_attempts_collection.find_one({"email": normalized_email})
    
    if not attempt_doc:
        return False, None
    
    # Check if lockout period has expired
    locked_until = attempt_doc.get("lockedUntil")
    if locked_until:
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        
        if now < locked_until:
            minutes_remaining = int((locked_until - now).total_seconds() / 60)
            return True, minutes_remaining
        else:
            # Lockout period expired, reset attempts
            await otp_attempts_collection.update_one(
                {"email": normalized_email},
                {"$set": {"failedAttempts": 0, "lockedUntil": None}}
            )
            return False, None
    
    return False, None


async def increment_otp_attempts(email: str) -> int:
    """
    Increment failed OTP verification attempts
    Returns: number of failed attempts after incrementing
    """
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)

    # 1. Fetch current attempt status
    attempt_doc = await otp_attempts_collection.find_one({"email": normalized_email})
    
    # 2. Determine if we should reset the counter
    if attempt_doc and attempt_doc.get("updatedAt"):
        last_attempt = attempt_doc.get("updatedAt")
        if last_attempt.tzinfo is None:
            last_attempt = last_attempt.replace(tzinfo=timezone.utc)
        
        if now - last_attempt > timedelta(minutes=LOCKOUT_DURATION_MINUTES):
            # Window expired, reset to 1
            await otp_attempts_collection.update_one(
                {"email": normalized_email},
                {"$set": {"failedAttempts": 1, "updatedAt": now, "lockedUntil": None}}
            )
            return 1
    
    result = await otp_attempts_collection.find_one_and_update(
        {"email": normalized_email},
        {
            "$inc": {"failedAttempts": 1},
            "$set": {"updatedAt": now}
        },
        upsert=True,
        return_document=True
    )
    
    failed_attempts = result.get("failedAttempts", 1)
    
    # Lock account if max attempts reached
    if failed_attempts >= MAX_OTP_ATTEMPTS:
        locked_until = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        await otp_attempts_collection.update_one(
            {"email": normalized_email},
            {"$set": {"lockedUntil": locked_until}}
        )
    
    return failed_attempts


async def reset_otp_attempts(email: str):
    """Reset OTP attempts for successful verification"""
    normalized_email = email.strip().lower()
    await otp_attempts_collection.update_one(
        {"email": normalized_email},
        {"$set": {"failedAttempts": 0, "lockedUntil": None}}
    )

async def delete_otp_attempts(email: str):
    """Delete OTP attempt record entirely (used when new OTP is requested)"""
    normalized_email = email.strip().lower()
    await otp_attempts_collection.delete_one({"email": normalized_email})