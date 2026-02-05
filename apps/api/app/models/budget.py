from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class BudgetBase(BaseModel):
    category_id: str
    period: str  # YYYY-MM
    amount_planned: float


class BudgetCreate(BudgetBase):
    pass


class BudgetUpdate(BaseModel):
    amount_planned: float


class Budget(BudgetBase):
    id: str
    user_id: str
    category_name: Optional[str] = None
    spent_amount: float = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class BudgetComparison(Budget):
    remaining: float = 0
    percentage: float = 0


class BudgetCopy(BaseModel):
    from_period: str
    to_period: str
