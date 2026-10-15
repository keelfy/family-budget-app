from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AllowanceUpdate(BaseModel):
    monthly_limit: float = Field(ge=0)


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
