from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AllowanceCreate(BaseModel):
    name: str
    monthly_limit: float = 150


class AllowanceUpdate(BaseModel):
    name: Optional[str] = None
    monthly_limit: Optional[float] = None
    is_active: Optional[bool] = None


class AllowanceDefinition(BaseModel):
    id: str
    user_id: str
    name: str
    monthly_limit: float
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AllowanceBalance(BaseModel):
    id: str
    user_id: str
    allowance_id: str
    allowance_name: Optional[str] = None
    period: str  # YYYY-MM
    monthly_limit: float
    carry_over_from_previous: float = 0
    spent_amount: float = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
