from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from psycopg import AsyncConnection
from app.db import fetch_all, fetch_one, insert, update
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Investment, InvestmentCreate, InvestmentTransaction, DividendInput
from app.services.currency_service import get_exchange_rate, convert_amount

router = APIRouter()

_INVESTMENT_SELECT = """
    SELECT i.*, a.name AS account_name
    FROM investments i
    JOIN accounts a ON a.id = i.account_id
"""


async def calculate_investment_values(investment: dict, db: AsyncConnection) -> dict:
    """Calculate current value and unrealized gain/loss."""
    current_value_eur = None
    unrealized_gain_loss = None

    if investment.get("current_price") and investment.get("quantity", 0) > 0:
        current_value = investment["current_price"] * investment["quantity"]

        # Convert to EUR if needed
        if investment["current_price_currency"] != "EUR":
            try:
                rate = await get_exchange_rate(investment["current_price_currency"], "EUR", db=db)
                current_value_eur = current_value * rate
            except Exception:
                current_value_eur = current_value
        else:
            current_value_eur = current_value

        unrealized_gain_loss = current_value_eur - investment["cost_basis"]

    return {
        "current_value_eur": current_value_eur,
        "unrealized_gain_loss": unrealized_gain_loss,
    }


@router.get("", response_model=List[Investment])
async def list_investments(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all investments for the current user."""
    rows = await fetch_all(
        db,
        f"{_INVESTMENT_SELECT} WHERE i.user_id = %s ORDER BY i.asset_name",
        [current_user.id],
    )

    return [
        Investment(**inv, **await calculate_investment_values(inv, db)) for inv in rows
    ]


@router.get("/{investment_id}", response_model=Investment)
async def get_investment(
    investment_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a specific investment."""
    inv = await fetch_one(
        db,
        f"{_INVESTMENT_SELECT} WHERE i.id = %s AND i.user_id = %s",
        [investment_id, current_user.id],
    )

    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    return Investment(**inv, **await calculate_investment_values(inv, db))


@router.post("", response_model=Investment, status_code=status.HTTP_201_CREATED)
async def create_investment(
    investment: InvestmentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new investment."""
    # Verify account ownership
    account = await fetch_one(
        db,
        "SELECT id FROM accounts WHERE id = %s AND user_id = %s",
        [investment.account_id, current_user.id],
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    created = await insert(
        db,
        "investments",
        {
            "user_id": current_user.id,
            "account_id": investment.account_id,
            "asset_name": investment.asset_name,
            "ticker": investment.ticker,
            "asset_type": investment.asset_type,
        },
    )

    return await get_investment(created["id"], current_user, db)


@router.post("/{investment_id}/buy", response_model=Investment)
async def buy_investment(
    investment_id: str,
    transaction: InvestmentTransaction,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Record a buy transaction for an investment."""
    # Verify ownership
    inv = await fetch_one(
        db,
        "SELECT * FROM investments WHERE id = %s AND user_id = %s",
        [investment_id, current_user.id],
    )
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    # Calculate new values
    total_cost = transaction.quantity * transaction.price_per_unit

    # Convert to EUR for cost basis
    total_cost_eur, _, _ = await convert_amount(total_cost, transaction.currency, "EUR", transaction.transaction_date, db)

    new_quantity = inv["quantity"] + transaction.quantity
    new_cost_basis = inv["cost_basis"] + total_cost_eur
    new_avg_cost = new_cost_basis / new_quantity if new_quantity > 0 else 0

    async with db.transaction():
        await update(
            db,
            "investments",
            {
                "quantity": new_quantity,
                "cost_basis": new_cost_basis,
                "average_cost_per_unit": new_avg_cost,
            },
            {"id": investment_id},
        )

        # Record investment transaction
        await insert(
            db,
            "investment_transactions",
            {
                "investment_id": investment_id,
                "type": "buy",
                "quantity": transaction.quantity,
                "price_per_unit": transaction.price_per_unit,
                "currency": transaction.currency,
                "total_amount": total_cost,
                "transaction_date": transaction.transaction_date,
            },
        )

    return await get_investment(investment_id, current_user, db)


@router.post("/{investment_id}/sell", response_model=Investment)
async def sell_investment(
    investment_id: str,
    transaction: InvestmentTransaction,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Record a sell transaction for an investment."""
    # Verify ownership
    inv = await fetch_one(
        db,
        "SELECT * FROM investments WHERE id = %s AND user_id = %s",
        [investment_id, current_user.id],
    )
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    if transaction.quantity > inv["quantity"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot sell more than owned quantity")

    # Calculate new values
    total_proceeds = transaction.quantity * transaction.price_per_unit
    total_proceeds_eur, _, _ = await convert_amount(total_proceeds, transaction.currency, "EUR", transaction.transaction_date, db)

    # Reduce cost basis proportionally
    cost_reduction = (transaction.quantity / inv["quantity"]) * inv["cost_basis"] if inv["quantity"] > 0 else 0

    new_quantity = inv["quantity"] - transaction.quantity
    new_cost_basis = inv["cost_basis"] - cost_reduction
    new_avg_cost = new_cost_basis / new_quantity if new_quantity > 0 else 0

    async with db.transaction():
        await update(
            db,
            "investments",
            {
                "quantity": new_quantity,
                "cost_basis": new_cost_basis,
                "average_cost_per_unit": new_avg_cost,
            },
            {"id": investment_id},
        )

        # Record investment transaction
        await insert(
            db,
            "investment_transactions",
            {
                "investment_id": investment_id,
                "type": "sell",
                "quantity": transaction.quantity,
                "price_per_unit": transaction.price_per_unit,
                "currency": transaction.currency,
                "total_amount": total_proceeds,
                "transaction_date": transaction.transaction_date,
            },
        )

    return await get_investment(investment_id, current_user, db)


@router.post("/{investment_id}/dividend")
async def record_dividend(
    investment_id: str,
    dividend: DividendInput,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Record a dividend payment for an investment."""
    # Verify ownership
    inv = await fetch_one(
        db,
        "SELECT * FROM investments WHERE id = %s AND user_id = %s",
        [investment_id, current_user.id],
    )
    if not inv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    # Record dividend transaction
    await insert(
        db,
        "investment_transactions",
        {
            "investment_id": investment_id,
            "type": "dividend",
            "price_per_unit": dividend.amount,
            "currency": dividend.currency,
            "total_amount": dividend.amount,
            "transaction_date": dividend.transaction_date,
        },
    )

    return {"message": "Dividend recorded successfully"}


@router.post("/refresh-prices")
async def refresh_prices(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """
    Refresh prices for all investments.
    Note: In production, this would call Yahoo Finance/CoinGecko APIs.
    """
    # This is a placeholder - in production, implement actual price fetching
    return {"message": "Price refresh not implemented. Manual price updates required."}
