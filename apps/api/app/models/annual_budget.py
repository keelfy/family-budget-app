from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AnnualBudgetCreate(BaseModel):
    name: str
    year: str
    amount_planned: float


class AnnualBudgetUpdate(BaseModel):
    name: Optional[str] = None
    amount_planned: Optional[float] = None
    is_active: Optional[bool] = None


class AnnualBudget(BaseModel):
    id: str
    user_id: str
    name: str
    year: str
    amount_planned: float
    spent_amount: float = 0
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
