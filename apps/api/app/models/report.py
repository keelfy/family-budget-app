from pydantic import BaseModel
from typing import List, Optional
from app.models.account import AccountBalance


class DashboardReport(BaseModel):
    total_balance_eur: float
    monthly_income: float
    monthly_expenses: float
    net_savings: float


class NetWorthReport(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float
    accounts: List[AccountBalance]
    investments_value: float


class CategoryAmount(BaseModel):
    category_id: str
    category_name: str
    type: str
    amount: float


class CashFlowReport(BaseModel):
    period: str
    income: float
    expenses: float
    net: float
    by_category: List[CategoryAmount]
