from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: Optional[str] = None
    # Join an existing family instead of starting a new one.
    invite_code: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class User(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    family_id: str
    role: str
    created_at: datetime

    class Config:
        from_attributes = True


class FamilyMember(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    allowance_id: Optional[str] = None


class FamilyInvite(BaseModel):
    code: str
    expires_at: datetime
