from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    display_name: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class User(BaseModel):
    id: str
    email: str
    display_name: Optional[str] = None
    role: str
    created_at: datetime

    class Config:
        from_attributes = True
