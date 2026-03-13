from fastapi import APIRouter, status, Request, HTTPException
from app.utils.rate_limit import rate_limit_dep
from app.services.auth_service import (
    register_user_service,
    login_user_service,
    refresh_token_service,
    logout_user_service,
    google_sign_in_service,
    send_email_otp_service,
    verify_email_otp_service,
    get_current_user_service,
    forgot_password_service,
    reset_password_service,
)
from app.models.user_schema import (
    UserCreate,
    UserLogin,
    RefreshTokenRequest,
    LogoutRequest,
    GoogleSignInRequest,
    EmailSendOTPRequest,
    EmailVerifyOTPRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.utils.otp_memory_store import get_resend_cooldown_remaining
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Register a new user", tags=["auth"])
async def register(user: UserCreate):
    return await register_user_service(user)


@router.post("/login", status_code=status.HTTP_200_OK, summary="Authenticate user and return JWT", tags=["auth"])
@rate_limit_dep
async def login(request: Request, data: UserLogin):
    return await login_user_service(data)


@router.post("/google", status_code=status.HTTP_200_OK, summary="Google sign in", tags=["auth"])
async def google_sign_in(payload: GoogleSignInRequest):
    return await google_sign_in_service(payload)


@router.post("/email/send-otp", status_code=status.HTTP_200_OK, summary="Send email verification OTP", tags=["auth"])
async def send_email_otp(payload: EmailSendOTPRequest):
    return await send_email_otp_service(payload.email)


@router.post("/email/resend-otp", status_code=status.HTTP_200_OK, summary="Check OTP resend cooldown status", tags=["auth"])
async def check_resend_status(payload: EmailSendOTPRequest):
    """Check if OTP can be resent or get cooldown remaining time"""
    normalized_email = payload.email.strip().lower()
    cooldown_remaining = await get_resend_cooldown_remaining(normalized_email)
    
    if cooldown_remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Please wait {cooldown_remaining} seconds before requesting another OTP"
        )
    
    # If cooldown is 0, attempt to send new OTP
    return await send_email_otp_service(payload.email)


@router.post("/email/verify-otp", status_code=status.HTTP_200_OK, summary="Verify email OTP", tags=["auth"])
async def verify_email_otp(payload: EmailVerifyOTPRequest):
    return await verify_email_otp_service(payload.email, payload.otp)


@router.post("/refresh", status_code=status.HTTP_200_OK, summary="Refresh access token", tags=["auth"])
async def refresh_token_endpoint(payload: RefreshTokenRequest):
    return await refresh_token_service(payload)


@router.post("/logout", status_code=status.HTTP_200_OK, summary="Logout user", tags=["auth"])
async def logout(payload: LogoutRequest):
    return await logout_user_service(payload)


@router.get("/me", status_code=status.HTTP_200_OK, summary="Get current user", tags=["auth"])
async def get_current_user(request: Request):
    return await get_current_user_service(request)


@router.post("/forgot-password", status_code=status.HTTP_200_OK, summary="Send password reset OTP", tags=["auth"])
async def forgot_password(payload: ForgotPasswordRequest):
    return await forgot_password_service(payload.email)


@router.post("/verify-reset-otp", status_code=status.HTTP_200_OK, summary="Verify password reset OTP", tags=["auth"])
async def verify_reset_otp(payload: EmailVerifyOTPRequest):
    return await verify_email_otp_service(payload.email, payload.otp, otp_type="password_reset")


@router.post("/reset-password", status_code=status.HTTP_200_OK, summary="Reset password with OTP", tags=["auth"])
async def reset_password(payload: ResetPasswordRequest):
    return await reset_password_service(payload.email, payload.otp, payload.newPassword)
