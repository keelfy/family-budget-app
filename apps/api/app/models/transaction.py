from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, date


CategoryType = Literal["income", "expense", "transfer"]


class TransactionItemIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0)
    # None: same category as the transaction.
    category_id: Optional[str] = None


class TransactionItem(TransactionItemIn):
    id: str
    position: int
    category_name: Optional[str] = None


class TransactionBase(BaseModel):
    account_id: str
    category_id: str
    amount_original: float
    currency_original: str = "EUR"
    transaction_date: date
    accounting_period: Optional[str] = None  # YYYY-MM, defaults to transaction_date month
    description: Optional[str] = None
    notes: Optional[str] = None
    allowance_id: Optional[str] = None
    annual_budget_id: Optional[str] = None


class TransactionCreate(TransactionBase):
    exchange_rate: Optional[float] = None
    # Receipt lines; when non-empty their sum must equal amount_original.
    items: Optional[List[TransactionItemIn]] = None


class TransactionUpdate(BaseModel):
    category_id: Optional[str] = None
    amount_original: Optional[float] = None
    transaction_date: Optional[date] = None
    accounting_period: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    allowance_id: Optional[str] = None
    annual_budget_id: Optional[str] = None
    exchange_rate: Optional[float] = None
    # Omitted: keep existing lines. Provided: replace them ([] clears).
    items: Optional[List[TransactionItemIn]] = None


class Transaction(TransactionBase):
    id: str
    user_id: str
    account_name: Optional[str] = None
    category_name: Optional[str] = None
    category_type: Optional[CategoryType] = None
    allowance_name: Optional[str] = None
    annual_budget_name: Optional[str] = None
    amount_base_eur: float
    exchange_rate: float
    exchange_rate_source: str
    transfer_to_account_id: Optional[str] = None
    transfer_transaction_id: Optional[str] = None
    items_count: int = 0
    items: List[TransactionItem] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TransferCreate(BaseModel):
    from_account_id: str
    to_account_id: str
    amount: float
    currency: str = "EUR"
    # Actual amount received in the destination currency (exchange-office visit).
    # Records the user's own rate for this currency pair.
    to_amount: Optional[float] = Field(None, gt=0)
    transaction_date: date
    description: Optional[str] = None
