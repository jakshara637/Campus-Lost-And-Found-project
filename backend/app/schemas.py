from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from pydantic import EmailStr


class ItemCreate(BaseModel):    # validates incoming data
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(min_length=5)
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=150)

    item_type: Literal["lost", "found"]

    # Temporary: until authentication is implemented, the API will accept the ID of an existing user.
    posted_by: int = Field(gt=0)


class ItemResponse(BaseModel):  # defines the API response
    id: int
    title: str
    description: str
    category: str
    location: str
    image_path: str | None = None
    item_type: str
    status: str
    posted_by: int
    posted_by_name: str | None = None
    posted_by_email: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ItemUpdate(BaseModel):
    title: str = Field(min_length=2, max_length=150)
    description: str = Field(min_length=5)
    category: str = Field(min_length=2, max_length=80)
    location: str = Field(min_length=2, max_length=150)
    item_type: Literal["lost", "found"]
    status: Literal["open", "claim_requested", "resolved"]


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserResponse(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: str
    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ClaimCreate(BaseModel):
    message: str = Field(min_length=10, max_length=1000)

class ClaimResponse(BaseModel):
    id: int
    item_id: int
    claimant_id: int
    message: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ClaimReview(BaseModel):
    status: Literal["approved", "rejected"]


class RegistrationPendingResponse(BaseModel):
    message: str


class VerifyOTP(BaseModel):
    email: EmailStr
    otp: str = Field(pattern=r"^[0-9]{6}$")


class ResendOTP(BaseModel):
    email: EmailStr

class NotificationPreferences(BaseModel):
    email_new_post_alerts: bool