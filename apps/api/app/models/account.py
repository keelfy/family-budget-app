from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime


AccountType = Literal["checking", "savings", "investment", "credit", "cash"]


class AccountBase(BaseModel):
    name: str
    type: AccountType
    currency_code: str = "EUR"
    icon: Optional[str] = None
    color: Optional[str] = None


class AccountCreate(AccountBase):
    initial_balance: float = 0


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[AccountType] = None
    currency_code: Optional[str] = None
    is_active: Optional[bool] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    sort_order: Optional[int] = None


class Account(AccountBase):
    id: str
    user_id: str
    initial_balance: float
    current_balance: float
    current_balance_eur: Optional[float] = None
    is_active: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AccountBalance(Account):
    pending_transactions: int = 0
