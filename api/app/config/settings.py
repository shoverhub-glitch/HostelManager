import os
from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.environ.get("MONGO_URL")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME","project")
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", 15))
REFRESH_TOKEN_EXPIRE_MINUTES = int(os.environ.get("REFRESH_TOKEN_EXPIRE_MINUTES", 60*24*30))
ALLOWED_ORIGINS = os.environ.get("ALLOWED_ORIGINS")
FROM_EMAIL = os.environ.get("FROM_EMAIL")
ENV = os.environ.get("ENV", "production")
GOOGLE_CLIENT_IDS = os.environ.get("GOOGLE_CLIENT_IDS", "")
# Zoho Zepto Mail Configuration
ZEPTO_MAIL_API_KEY = os.environ.get("ZEPTO_MAIL_API_KEY")

PUBLIC_PATHS = os.environ.get("PUBLIC_PATHS")
if not PUBLIC_PATHS:
	PUBLIC_PATHS = ",".join([
		"/api/v1/health",
		"/api/v1/health/auth-config",
		"/api/v1/auth/login",
		"/api/v1/auth/register",
		"/api/v1/auth/google",
		"/api/v1/auth/refresh",
		"/api/v1/auth/forgot-password",
		"/api/v1/auth/verify-reset-otp",
		"/api/v1/auth/reset-password",
		"/api/v1/auth/email/send-otp",
		"/api/v1/auth/email/verify-otp",
		"/api/v1/auth/email/resend-otp",
		"/api/v1/auth/resend-otp",
		"/api/v1/auth/resend-verification",
		"/api/v1/subscription/webhook",
	])
# Razorpay
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET")