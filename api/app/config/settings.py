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
API_VERSION = "v1"
# Zoho Zepto Mail Configuration
ZEPTO_MAIL_API_KEY = os.environ.get("ZEPTO_MAIL_API_KEY")
DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"
DEMO_OTP = os.environ.get("DEMO_OTP", "130499")
PUBLIC_PATHS = os.environ.get("PUBLIC_PATHS")

if not PUBLIC_PATHS:
	PUBLIC_PATHS = ",".join([
		f"/api/{API_VERSION}/health",
		f"/api/{API_VERSION}/auth/login",
		f"/api/{API_VERSION}/auth/register",
		f"/api/{API_VERSION}/auth/refresh",
		f"/api/{API_VERSION}/auth/forgot-password",
		f"/api/{API_VERSION}/auth/verify-reset-otp",
		f"/api/{API_VERSION}/auth/reset-password",
		f"/api/{API_VERSION}/auth/email/send-otp",
		f"/api/{API_VERSION}/auth/email/verify-otp",
		f"/api/{API_VERSION}/auth/email/resend-otp",
		f"/api/{API_VERSION}/subscription/webhook",
	])
# Razorpay
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")
RAZORPAY_WEBHOOK_SECRET = os.environ.get("RAZORPAY_WEBHOOK_SECRET")

# Backup Configuration
BACKUP_PATH = os.environ.get("BACKUP_PATH", "/app/backups")
BACKUP_RETENTION_DAYS = int(os.environ.get("BACKUP_RETENTION_DAYS", 7))

# Ensure the backup directory exists
if not os.path.exists(BACKUP_PATH):
    try:
        os.makedirs(BACKUP_PATH, exist_ok=True)
    except Exception as e:
        print(f"Warning: Could not create backup directory: {e}")

# Admin security configuration
# Access is granted when user matches ANY configured selector below.
# Keep ADMIN_ACCESS_FAIL_CLOSED=true to avoid accidental broad access.
ADMIN_ACCESS_ROLES = os.environ.get("ADMIN_ACCESS_ROLES", "admin")
ADMIN_ACCESS_EMAILS = os.environ.get("ADMIN_ACCESS_EMAILS", "")
ADMIN_ACCESS_USER_IDS = os.environ.get("ADMIN_ACCESS_USER_IDS", "")
ADMIN_ACCESS_FAIL_CLOSED = os.environ.get("ADMIN_ACCESS_FAIL_CLOSED", "true").lower() == "true"

# Optional extra controls for admin endpoints.
ADMIN_ALLOWED_IPS = os.environ.get("ADMIN_ALLOWED_IPS", "")
ADMIN_REQUIRE_API_KEY = os.environ.get("ADMIN_REQUIRE_API_KEY", "false").lower() == "true"
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")
ADMIN_API_KEY_HEADER = os.environ.get("ADMIN_API_KEY_HEADER", "X-Admin-Secret")
TRUST_PROXY_HEADERS = os.environ.get("TRUST_PROXY_HEADERS", "false").lower() == "true"

# App Configuration
APP_NAME = os.environ.get("APP_NAME", "Hostel Manager")
APP_URL = os.environ.get("APP_URL", "https://your-app-url.com")