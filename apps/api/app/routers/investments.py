from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Investment, InvestmentCreate, InvestmentTransaction, DividendInput
from app.services.currency_service import get_exchange_rate, convert_amount

router = APIRouter()


async def calculate_investment_values(investment: dict, db: Client) -> dict:
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
    db: Client = Depends(get_db),
):
    """List all investments for the current user."""
    result = db.table("investments").select(
        "*, accounts!inner(name)"
    ).eq("user_id", current_user.id).order("asset_name").execute()

    investments = []
    for inv in result.data:
        values = await calculate_investment_values(inv, db)
        investments.append(Investment(
            id=inv["id"],
            user_id=inv["user_id"],
            account_id=inv["account_id"],
            account_name=inv["accounts"]["name"] if inv.get("accounts") else None,
            asset_name=inv["asset_name"],
            ticker=inv["ticker"],
            asset_type=inv["asset_type"],
            quantity=inv["quantity"],
            cost_basis=inv["cost_basis"],
            average_cost_per_unit=inv["average_cost_per_unit"],
            current_price=inv["current_price"],
            current_price_currency=inv["current_price_currency"],
            current_value_eur=values["current_value_eur"],
            unrealized_gain_loss=values["unrealized_gain_loss"],
            price_updated_at=inv["price_updated_at"],
            created_at=inv["created_at"],
            updated_at=inv["updated_at"],
        ))

    return investments


@router.get("/{investment_id}", response_model=Investment)
async def get_investment(
    investment_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a specific investment."""
    result = db.table("investments").select(
        "*, accounts!inner(name)"
    ).eq("id", investment_id).eq("user_id", current_user.id).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    inv = result.data[0]
    values = await calculate_investment_values(inv, db)

    return Investment(
        id=inv["id"],
        user_id=inv["user_id"],
        account_id=inv["account_id"],
        account_name=inv["accounts"]["name"] if inv.get("accounts") else None,
        asset_name=inv["asset_name"],
        ticker=inv["ticker"],
        asset_type=inv["asset_type"],
        quantity=inv["quantity"],
        cost_basis=inv["cost_basis"],
        average_cost_per_unit=inv["average_cost_per_unit"],
        current_price=inv["current_price"],
        current_price_currency=inv["current_price_currency"],
        current_value_eur=values["current_value_eur"],
        unrealized_gain_loss=values["unrealized_gain_loss"],
        price_updated_at=inv["price_updated_at"],
        created_at=inv["created_at"],
        updated_at=inv["updated_at"],
    )


@router.post("", response_model=Investment, status_code=status.HTTP_201_CREATED)
async def create_investment(
    investment: InvestmentCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new investment."""
    # Verify account ownership
    account = db.table("accounts").select("id").eq("id", investment.account_id).eq("user_id", current_user.id).execute()
    if not account.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    data = {
        "user_id": current_user.id,
        "account_id": investment.account_id,
        "asset_name": investment.asset_name,
        "ticker": investment.ticker,
        "asset_type": investment.asset_type,
    }

    result = db.table("investments").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create investment")

    return await get_investment(result.data[0]["id"], current_user, db)


@router.post("/{investment_id}/buy", response_model=Investment)
async def buy_investment(
    investment_id: str,
    transaction: InvestmentTransaction,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Record a buy transaction for an investment."""
    # Verify ownership
    existing = db.table("investments").select("*").eq("id", investment_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    inv = existing.data[0]

    # Calculate new values
    total_cost = transaction.quantity * transaction.price_per_unit

    # Convert to EUR for cost basis
    total_cost_eur, _, _ = await convert_amount(total_cost, transaction.currency, "EUR", transaction.transaction_date, db)

    new_quantity = inv["quantity"] + transaction.quantity
    new_cost_basis = inv["cost_basis"] + total_cost_eur
    new_avg_cost = new_cost_basis / new_quantity if new_quantity > 0 else 0

    # Update investment
    update_data = {
        "quantity": new_quantity,
        "cost_basis": new_cost_basis,
        "average_cost_per_unit": new_avg_cost,
    }

    db.table("investments").update(update_data).eq("id", investment_id).execute()

    # Record investment transaction
    db.table("investment_transactions").insert({
        "investment_id": investment_id,
        "type": "buy",
        "quantity": transaction.quantity,
        "price_per_unit": transaction.price_per_unit,
        "currency": transaction.currency,
        "total_amount": total_cost,
        "transaction_date": transaction.transaction_date.isoformat(),
    }).execute()

    return await get_investment(investment_id, current_user, db)


@router.post("/{investment_id}/sell", response_model=Investment)
async def sell_investment(
    investment_id: str,
    transaction: InvestmentTransaction,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Record a sell transaction for an investment."""
    # Verify ownership
    existing = db.table("investments").select("*").eq("id", investment_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    inv = existing.data[0]

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

    # Update investment
    update_data = {
        "quantity": new_quantity,
        "cost_basis": new_cost_basis,
        "average_cost_per_unit": new_avg_cost,
    }

    db.table("investments").update(update_data).eq("id", investment_id).execute()

    # Record investment transaction
    db.table("investment_transactions").insert({
        "investment_id": investment_id,
        "type": "sell",
        "quantity": transaction.quantity,
        "price_per_unit": transaction.price_per_unit,
        "currency": transaction.currency,
        "total_amount": total_proceeds,
        "transaction_date": transaction.transaction_date.isoformat(),
    }).execute()

    return await get_investment(investment_id, current_user, db)


@router.post("/{investment_id}/dividend")
async def record_dividend(
    investment_id: str,
    dividend: DividendInput,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Record a dividend payment for an investment."""
    # Verify ownership
    existing = db.table("investments").select("*").eq("id", investment_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Investment not found")

    # Record dividend transaction
    db.table("investment_transactions").insert({
        "investment_id": investment_id,
        "type": "dividend",
        "price_per_unit": dividend.amount,
        "currency": dividend.currency,
        "total_amount": dividend.amount,
        "transaction_date": dividend.transaction_date.isoformat(),
    }).execute()

    return {"message": "Dividend recorded successfully"}


@router.post("/refresh-prices")
async def refresh_prices(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Refresh prices for all investments.
    Note: In production, this would call Yahoo Finance/CoinGecko APIs.
    """
    # This is a placeholder - in production, implement actual price fetching
    return {"message": "Price refresh not implemented. Manual price updates required."}
