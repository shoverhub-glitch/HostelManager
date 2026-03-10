from passlib.context import CryptContext
from passlib.hash import argon2

from jose import jwt
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.config import settings

SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_TOKEN_EXPIRE_MINUTES = settings.REFRESH_TOKEN_EXPIRE_MINUTES

if not SECRET_KEY or len(SECRET_KEY) < 32:
	raise RuntimeError("JWT_SECRET must be set and at least 32 characters long for security.")

if not SECRET_KEY or len(SECRET_KEY) < 32:
	raise RuntimeError("JWT_SECRET must be set and at least 32 characters long for security.")

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")



# OAuth2 scheme for JWT Bearer token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme)):
	try:
		payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
		user_id = payload.get("sub")
		if user_id is None:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")
		return user_id
	except Exception:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication credentials")

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
