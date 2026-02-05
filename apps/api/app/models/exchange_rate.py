from pydantic import BaseModel
from datetime import datetime, date


class ExchangeRateBase(BaseModel):
    from_currency: str
    to_currency: str
    rate: float
    rate_date: date


class ExchangeRateCreate(ExchangeRateBase):
    pass


class ExchangeRate(ExchangeRateBase):
    id: str
    source: str
    created_at: datetime

    class Config:
        from_attributes = True
