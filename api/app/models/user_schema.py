from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime,timezone


class UserInDB(BaseModel):
    id: Optional[str] = None
    name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str  # hashed
    role: str = Field(default="propertyowner")
    isVerified: bool = False
    isEmailVerified: bool = False
    isDeleted: bool = False
    lastLogin: Optional[datetime] = None    
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    # Device tracking fields for future scalability
    deviceId: Optional[str] = None
    deviceType: Optional[str] = None
    osVersion: Optional[str] = None
    appVersion: Optional[str] = None
    propertyLimit: int = 3
    propertyIds: Optional[list[str]] = Field(default_factory=list)

class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    phone: Optional[str] = None
    propertyIds: Optional[list[str]] = Field(default_factory=list)

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleSignInRequest(BaseModel):
    idToken: str


class EmailSendOTPRequest(BaseModel):
    email: EmailStr


class EmailSendOTPResponse(BaseModel):
    message: str


class EmailVerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class AuthResponse(BaseModel):
    accessToken: str
    refreshToken: str
    user: UserOut

class RefreshTokenRequest(BaseModel):
    refreshToken: str

class RefreshTokenResponse(BaseModel):
    accessToken: str
    user: UserOut

class LogoutRequest(BaseModel):
    refreshToken: str

class LogoutResponse(BaseModel):
    success: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    newPassword: str


class ResetPasswordResponse(BaseModel):
    message: str
    success: bool


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str


class ChangePasswordResponse(BaseModel):
    message: str
    success: bool