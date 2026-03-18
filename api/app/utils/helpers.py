from passlib.context import CryptContext
from passlib.hash import argon2

from jose import jwt
from datetime import datetime, timedelta, timezone
import hmac
import ipaddress
import logging
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from app.config import settings
from app.database.token_blacklist import is_token_blacklisted

SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_MINUTES = settings.REFRESH_TOKEN_EXPIRE_MINUTES

if not SECRET_KEY or len(SECRET_KEY) < 32:
	raise RuntimeError("JWT_SECRET must be set and at least 32 characters long for security.")

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
logger = logging.getLogger(__name__)



# OAuth2 scheme for JWT Bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

async def get_current_user(token: str = Depends(oauth2_scheme)):
	try:
		if await is_token_blacklisted(token):
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has been revoked")

		payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
		if payload.get("type") != "access":
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

		user_id = payload.get("sub")
		if user_id is None:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
		return user_id
	except HTTPException:
		raise
	except Exception:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")


def get_current_user_from_request(request: Request) -> dict:
	"""Read current user hydrated by UserContextMiddleware."""
	current_user = getattr(request.state, "current_user", None)
	if not current_user:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
	return current_user


def _csv_to_set(raw_value: str, to_lower: bool = False) -> set:
	if not raw_value:
		return set()
	values = {item.strip() for item in raw_value.split(",") if item and item.strip()}
	if to_lower:
		return {item.lower() for item in values}
	return values


def get_admin_access_config() -> dict:
	return {
		"roles": _csv_to_set(getattr(settings, "ADMIN_ACCESS_ROLES", "admin"), to_lower=True),
		"emails": _csv_to_set(getattr(settings, "ADMIN_ACCESS_EMAILS", ""), to_lower=True),
		"user_ids": _csv_to_set(getattr(settings, "ADMIN_ACCESS_USER_IDS", ""), to_lower=False),
		"fail_closed": bool(getattr(settings, "ADMIN_ACCESS_FAIL_CLOSED", True)),
	}


def has_admin_access(user: dict) -> bool:
	"""Evaluate configurable admin access rules against a user object."""
	config = get_admin_access_config()
	roles = config["roles"]
	emails = config["emails"]
	user_ids = config["user_ids"]
	fail_closed = config["fail_closed"]

	user_id = str(user.get("_id") or user.get("id") or "").strip()
	user_role = str(user.get("role") or "").strip().lower()
	user_email = str(user.get("email") or "").strip().lower()

	checks = []
	if roles:
		checks.append(user_role in roles)
	if emails:
		checks.append(user_email in emails)
	if user_ids:
		checks.append(user_id in user_ids)

	if checks:
		return any(checks)

	# If no selectors are configured and fail-closed is enabled, deny access.
	return not fail_closed


def _extract_client_ip(request: Request) -> str:
	client_host = request.client.host if request.client else ""
	if getattr(settings, "TRUST_PROXY_HEADERS", False):
		xff_header = request.headers.get("x-forwarded-for", "")
		if xff_header:
			client_host = xff_header.split(",", 1)[0].strip() or client_host
	return client_host


def _is_ip_allowed(client_ip: str, allowed_entries: set) -> bool:
	if not allowed_entries:
		return True
	try:
		ip_obj = ipaddress.ip_address(client_ip)
	except ValueError:
		return False

	for entry in allowed_entries:
		try:
			if "/" in entry:
				if ip_obj in ipaddress.ip_network(entry, strict=False):
					return True
			else:
				if ip_obj == ipaddress.ip_address(entry):
					return True
		except ValueError:
			# Ignore invalid config entries to avoid crashing requests.
			logger.warning("Skipping invalid ADMIN_ALLOWED_IPS entry: %s", entry)
	return False


def _enforce_admin_request_guards(request: Request) -> None:
	allowed_ips = _csv_to_set(getattr(settings, "ADMIN_ALLOWED_IPS", ""), to_lower=False)
	if allowed_ips:
		client_ip = _extract_client_ip(request)
		if not client_ip or not _is_ip_allowed(client_ip, allowed_ips):
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access not allowed from this IP")

	if getattr(settings, "ADMIN_REQUIRE_API_KEY", False):
		header_name = str(getattr(settings, "ADMIN_API_KEY_HEADER", "X-Admin-Secret") or "X-Admin-Secret")
		expected_key = str(getattr(settings, "ADMIN_API_KEY", "") or "")
		if not expected_key:
			raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Admin API key is not configured")
		provided_key = request.headers.get(header_name, "")
		if not provided_key or not hmac.compare_digest(provided_key, expected_key):
			raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid admin security key")


def require_admin_user(request: Request) -> dict:
	"""Allow only configured admin users to access protected endpoints."""
	current_user = get_current_user_from_request(request)
	_enforce_admin_request_guards(request)
	if not has_admin_access(current_user):
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
	return current_user

def hash_password(password: str) -> str:
	# Argon2 does not have the 72-byte limit
	return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
	return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta = None):
	to_encode = data.copy()
	expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
	to_encode.update({"exp": expire, "type": "access"})
	return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: timedelta = None):
	to_encode = data.copy()
	expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=REFRESH_TOKEN_EXPIRE_MINUTES))
	# Add a unique jti (JWT ID) for refresh token rotation
	import uuid
	to_encode.update({"exp": expire, "type": "refresh", "jti": str(uuid.uuid4())})
	return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
