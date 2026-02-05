from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import date
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import DashboardReport, NetWorthReport, CashFlowReport, AccountBalance
from app.models.report import CategoryAmount
from app.services.currency_service import get_exchange_rate

router = APIRouter()


def get_current_period() -> str:
    return date.today().strftime("%Y-%m")


@router.get("/dashboard", response_model=DashboardReport)
async def get_dashboard_report(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get dashboard summary report."""
    period = get_current_period()

    # Get total balance across all accounts
    accounts = db.table("accounts").select("*").eq("user_id", current_user.id).eq("is_active", True).execute()

    total_balance_eur = 0
    for acc in accounts.data:
        if acc["currency_code"] == "EUR":
            total_balance_eur += acc["current_balance"]
        else:
            try:
                rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
                total_balance_eur += acc["current_balance"] * rate
            except Exception:
                total_balance_eur += acc["current_balance"]

    # Get monthly transactions
    transactions = db.table("transactions").select(
        "amount_base_eur, categories!inner(type)"
    ).eq("user_id", current_user.id).eq("accounting_period", period).execute()

    monthly_income = 0
    monthly_expenses = 0

    for t in transactions.data:
        cat_type = t["categories"]["type"] if t.get("categories") else None
        if cat_type == "income":
            monthly_income += abs(t["amount_base_eur"])
        elif cat_type == "expense":
            monthly_expenses += abs(t["amount_base_eur"])

    return DashboardReport(
        total_balance_eur=round(total_balance_eur, 2),
        monthly_income=round(monthly_income, 2),
        monthly_expenses=round(monthly_expenses, 2),
        net_savings=round(monthly_income - monthly_expenses, 2),
    )


@router.get("/net-worth", response_model=NetWorthReport)
async def get_net_worth_report(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get net worth breakdown."""
    # Get accounts
    accounts_result = db.table("accounts").select("*").eq("user_id", current_user.id).eq("is_active", True).execute()

    total_assets = 0
    total_liabilities = 0
    account_balances = []

    for acc in accounts_result.data:
        balance_eur = acc["current_balance"]
        if acc["currency_code"] != "EUR":
            try:
                rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
                balance_eur = acc["current_balance"] * rate
            except Exception:
                pass

        account_balances.append(AccountBalance(
            **acc,
            current_balance_eur=balance_eur,
        ))

        if acc["type"] == "credit":
            total_liabilities += abs(balance_eur)
        else:
            total_assets += balance_eur

    # Get investments value
    investments = db.table("investments").select("*").eq("user_id", current_user.id).execute()

    investments_value = 0
    for inv in investments.data:
        if inv.get("current_price") and inv.get("quantity", 0) > 0:
            value = inv["current_price"] * inv["quantity"]
            if inv["current_price_currency"] != "EUR":
                try:
                    rate = await get_exchange_rate(inv["current_price_currency"], "EUR", db=db)
                    value = value * rate
                except Exception:
                    pass
            investments_value += value

    total_assets += investments_value

    return NetWorthReport(
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
        net_worth=round(total_assets - total_liabilities, 2),
        accounts=account_balances,
        investments_value=round(investments_value, 2),
    )


@router.get("/cash-flow", response_model=CashFlowReport)
async def get_cash_flow_report(
    period: Optional[str] = Query(None, description="Period (YYYY-MM)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get cash flow report for a period."""
    if period is None:
        period = get_current_period()

    # Get transactions with categories
    transactions = db.table("transactions").select(
        "amount_base_eur, category_id, categories!inner(name, type)"
    ).eq("user_id", current_user.id).eq("accounting_period", period).execute()

    income = 0
    expenses = 0
    by_category = {}

    for t in transactions.data:
        cat_type = t["categories"]["type"] if t.get("categories") else None
        cat_id = t["category_id"]
        cat_name = t["categories"]["name"] if t.get("categories") else "Unknown"
        amount = abs(t["amount_base_eur"])

        if cat_type == "income":
            income += amount
        elif cat_type == "expense":
            expenses += amount

        if cat_type in ("income", "expense"):
            if cat_id not in by_category:
                by_category[cat_id] = {
                    "category_id": cat_id,
                    "category_name": cat_name,
                    "type": cat_type,
                    "amount": 0,
                }
            by_category[cat_id]["amount"] += amount

    # Sort by amount descending
    category_list = sorted(by_category.values(), key=lambda x: x["amount"], reverse=True)

    return CashFlowReport(
        period=period,
        income=round(income, 2),
        expenses=round(expenses, 2),
        net=round(income - expenses, 2),
        by_category=[CategoryAmount(**c) for c in category_list],
    )
