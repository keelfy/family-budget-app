from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

# Add a kind here (and in packages/shared) to start tracking a new budget, e.g. "health".
TRACKED_KINDS = ("subscription",)
TrackedKind = Literal["subscription"]

BillingCycle = Literal["weekly", "monthly", "quarterly", "yearly"]


class TrackedItemCreate(BaseModel):
    kind: TrackedKind
    name: str = Field(min_length=1)
    amount: float = Field(gt=0)
    cycle: BillingCycle = "monthly"
    start_date: Optional[date] = None


class TrackedItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1)
    amount: Optional[float] = Field(None, gt=0)
    cycle: Optional[BillingCycle] = None
    start_date: Optional[date] = None
    is_active: Optional[bool] = None


class TrackedItem(BaseModel):
    id: str
    user_id: str
    kind: TrackedKind
    name: str
    amount: float
    cycle: BillingCycle
    start_date: date
    is_active: bool
    monthly_cost: float  # amount normalised to one month
    next_charge_date: date
    spent_amount: float = 0  # linked transactions in the requested period
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
