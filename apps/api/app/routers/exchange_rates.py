from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from datetime import date
from psycopg import AsyncConnection
from app.db import fetch_one
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import ExchangeRate, ExchangeRateCreate
from app.services.currency_service import get_exchange_rate as fetch_rate, save_exchange_rate

router = APIRouter()


@router.get("", response_model=ExchangeRate)
async def get_exchange_rate(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    rate_date: Optional[date] = Query(None, alias="date"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get exchange rate between two currencies."""
    if rate_date is None:
        rate_date = date.today()

    if from_currency == to_currency:
        return ExchangeRate(
            id="same-currency",
            from_currency=from_currency,
            to_currency=to_currency,
            rate=1.0,
            rate_date=rate_date,
            source="same_currency",
            created_at=date.today().isoformat(),
        )

    try:
        rate = await fetch_rate(from_currency, to_currency, rate_date, db)

        # Check if we have it in DB
        stored = await fetch_one(
            db,
            "SELECT * FROM exchange_rates WHERE from_currency = %s AND to_currency = %s AND rate_date = %s",
            [from_currency, to_currency, rate_date],
        )

        if stored:
            return ExchangeRate(**stored)

        return ExchangeRate(
            id="fetched",
            from_currency=from_currency,
            to_currency=to_currency,
            rate=rate,
            rate_date=rate_date,
            source="frankfurter",
            created_at=date.today().isoformat(),
        )

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Could not get exchange rate: {str(e)}",
        )


@router.post("", response_model=ExchangeRate, status_code=status.HTTP_201_CREATED)
async def create_exchange_rate(
    rate_data: ExchangeRateCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create or update a manual exchange rate."""
    row = await save_exchange_rate(
        db,
        rate_data.from_currency,
        rate_data.to_currency,
        rate_data.rate,
        rate_data.rate_date,
        "manual",
    )

    return ExchangeRate(**row)
