from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, date


AssetType = Literal["etf", "stock", "crypto", "bond"]


class InvestmentBase(BaseModel):
    account_id: str
    asset_name: str
    ticker: Optional[str] = None
    asset_type: AssetType


class InvestmentCreate(InvestmentBase):
    pass


class Investment(InvestmentBase):
    id: str
    user_id: str
    account_name: Optional[str] = None
    quantity: float = 0
    cost_basis: float = 0
    average_cost_per_unit: float = 0
    current_price: Optional[float] = None
    current_price_currency: str = "EUR"
    current_value_eur: Optional[float] = None
    unrealized_gain_loss: Optional[float] = None
    price_updated_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InvestmentTransaction(BaseModel):
    quantity: float
    price_per_unit: float
    currency: str = "EUR"
    transaction_date: date


class DividendInput(BaseModel):
    amount: float
    currency: str = "EUR"
    transaction_date: date
