from fastapi import APIRouter, Depends, Query
from typing import Optional
from datetime import date
from psycopg import AsyncConnection
from app.db import fetch_all
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
    db: AsyncConnection = Depends(get_db),
):
    """Get dashboard summary report."""
    period = get_current_period()

    # Get total balance across all accounts
    accounts = await fetch_all(
        db,
        "SELECT * FROM accounts WHERE family_id = %s AND is_active",
        [current_user.family_id],
    )

    total_balance_eur = 0
    for acc in accounts:
        if acc["currency_code"] == "EUR":
            total_balance_eur += acc["current_balance"]
        else:
            try:
                rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
                total_balance_eur += acc["current_balance"] * rate
            except Exception:
                total_balance_eur += acc["current_balance"]

    # Get monthly totals by category type
    totals = await fetch_all(
        db,
        "SELECT c.type, SUM(v.amount_eur) AS total "
        "FROM transaction_category_amounts v JOIN categories c ON c.id = v.category_id "
        "WHERE v.family_id = %s AND v.accounting_period = %s "
        "GROUP BY c.type",
        [current_user.family_id, period],
    )
    by_type = {row["type"]: row["total"] for row in totals}

    monthly_income = by_type.get("income", 0)
    monthly_expenses = by_type.get("expense", 0)

    return DashboardReport(
        total_balance_eur=round(total_balance_eur, 2),
        monthly_income=round(monthly_income, 2),
        monthly_expenses=round(monthly_expenses, 2),
        net_savings=round(monthly_income - monthly_expenses, 2),
    )


@router.get("/net-worth", response_model=NetWorthReport)
async def get_net_worth_report(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get net worth breakdown."""
    # Get accounts
    accounts = await fetch_all(
        db,
        "SELECT * FROM accounts WHERE family_id = %s AND is_active",
        [current_user.family_id],
    )

    total_assets = 0
    total_liabilities = 0
    account_balances = []

    for acc in accounts:
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
    investments = await fetch_all(
        db, "SELECT * FROM investments WHERE family_id = %s", [current_user.family_id]
    )

    investments_value = 0
    for inv in investments:
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
    db: AsyncConnection = Depends(get_db),
):
    """Get cash flow report for a period."""
    if period is None:
        period = get_current_period()

    # Get transactions with categories
    transactions = await fetch_all(
        db,
        "SELECT v.amount_eur, v.category_id, c.name AS category_name, c.type AS category_type "
        "FROM transaction_category_amounts v JOIN categories c ON c.id = v.category_id "
        "WHERE v.family_id = %s AND v.accounting_period = %s",
        [current_user.family_id, period],
    )

    income = 0
    expenses = 0
    by_category = {}

    for t in transactions:
        cat_type = t["category_type"]
        cat_id = t["category_id"]
        cat_name = t["category_name"]
        amount = t["amount_eur"]

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
