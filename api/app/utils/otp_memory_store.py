"""In-memory OTP storage with expiration and resend cooldown"""
from datetime import datetime, timedelta, timezone
import random
from typing import Optional, Tuple

# In-memory storage structure: {email: {otp, created_at, expires_at, last_sent_at, resend_cooldown_expires_at}}
otp_store: dict = {}


async def generate_and_store_otp(email: str, otp_type: str = "registration") -> Tuple[str, bool]:
    """
    Generate and store OTP in memory with resend cooldown
    
    Args:
        email: User email
        otp_type: Type of OTP (registration or password_reset)
    
    Returns:
        Tuple of (otp, can_resend) - OTP code and whether it's first request or within cooldown
    """
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc)
    
    # Check if there's an existing OTP and if we're within resend cooldown
    if normalized_email in otp_store:
        stored = otp_store[normalized_email]
        last_sent = stored.get("last_sent_at")
        resend_cooldown_expires = stored.get("resend_cooldown_expires_at")
        
        if resend_cooldown_expires and resend_cooldown_expires > now:
            # User is still in resend cooldown period
            remaining_seconds = int((resend_cooldown_expires - now).total_seconds())
            return stored.get("otp", ""), False
    
    # Generate new OTP
    otp = str(random.randint(100000, 999999))
    expires_at = now + timedelta(minutes=5)
    resend_cooldown_expires_at = now + timedelta(seconds=45)
    
    otp_store[normalized_email] = {
        "otp": otp,
        "otp_type": otp_type,
        "created_at": now,
        "expires_at": expires_at,
        "last_sent_at": now,
        "resend_cooldown_expires_at": resend_cooldown_expires_at,
        "verified": False,
        "attempt_count": 0
    }
    
    return otp, True


async def get_otp(email: str) -> Optional[dict]:
    """Get OTP record from memory"""
    normalized_email = email.strip().lower()
    if normalized_email not in otp_store:
        return None
    
    stored = otp_store[normalized_email]
    now = datetime.now(timezone.utc)
    
    # Check expiration
    if stored["expires_at"] < now:
        del otp_store[normalized_email]
        return None
    
    return stored


async def verify_otp(email: str, otp: str) -> Tuple[bool, Optional[str]]:
    """
    Verify OTP and return (is_valid, error_message)
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    normalized_email = email.strip().lower()
    stored = await get_otp(normalized_email)
    
    if not stored:
        return False, "OTP not found. Please request a new OTP"
    
    now = datetime.now(timezone.utc)
    
    # Check expiration
    if stored["expires_at"] < now:
        del otp_store[normalized_email]
        return False, "OTP expired. Please request a new OTP"
    
    # Check if OTP matches
    if stored["otp"] != otp:
        stored["attempt_count"] += 1
        
        if stored["attempt_count"] >= 5:
            # Lock for 10 minutes after 5 failed attempts
            locked_until = now + timedelta(minutes=10)
            stored["locked_until"] = locked_until
            return False, "Too many failed attempts. Please request a new OTP after 10 minutes"
        
        remaining_attempts = 5 - stored["attempt_count"]
        return False, f"Invalid OTP. {remaining_attempts} attempt(s) remaining"
    
    # Check if locked
    if "locked_until" in stored:
        locked_until = stored.get("locked_until")
        if locked_until and locked_until > now:
            remaining_seconds = int((locked_until - now).total_seconds())
            minutes_remaining = (remaining_seconds + 59) // 60
            return False, f"Too many failed attempts. Please try again in {minutes_remaining} minutes"
    
    return True, None


async def mark_otp_verified(email: str) -> bool:
    """Mark OTP as verified"""
    normalized_email = email.strip().lower()
    if normalized_email in otp_store:
        otp_store[normalized_email]["verified"] = True
        return True
    return False


async def get_resend_cooldown_remaining(email: str) -> int:
    """Get remaining cooldown seconds before resend is allowed. Returns 0 if resend is allowed"""
    normalized_email = email.strip().lower()
    if normalized_email not in otp_store:
        return 0
    
    stored = otp_store[normalized_email]
    resend_cooldown_expires = stored.get("resend_cooldown_expires_at")
    
    if not resend_cooldown_expires:
        return 0
    
    now = datetime.now(timezone.utc)
    remaining = (resend_cooldown_expires - now).total_seconds()
    
    return max(0, int(remaining))


async def delete_otp(email: str) -> bool:
    """Delete OTP from memory"""
    normalized_email = email.strip().lower()
    if normalized_email in otp_store:
        del otp_store[normalized_email]
        return True
    return False


async def cleanup_expired_otps() -> int:
    """Remove expired OTPs from memory. Returns count of cleaned entries"""
    now = datetime.now(timezone.utc)
    expired_emails = [
        email for email, data in otp_store.items()
        if data.get("expires_at", now) < now
    ]
    
    for email in expired_emails:
        del otp_store[email]
    
    return len(expired_emails)
