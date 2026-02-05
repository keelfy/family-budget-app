from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import Optional
from datetime import date
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import ExchangeRate, ExchangeRateCreate
from app.services.currency_service import get_exchange_rate as fetch_rate

router = APIRouter()


@router.get("", response_model=ExchangeRate)
async def get_exchange_rate(
    from_currency: str = Query(..., alias="from"),
    to_currency: str = Query(..., alias="to"),
    rate_date: Optional[date] = Query(None, alias="date"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
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
        result = db.table("exchange_rates").select("*").eq(
            "from_currency", from_currency
        ).eq("to_currency", to_currency).eq("rate_date", rate_date.isoformat()).execute()

        if result.data:
            return ExchangeRate(**result.data[0])

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
    db: Client = Depends(get_db),
):
    """Create or update a manual exchange rate."""
    data = {
        "from_currency": rate_data.from_currency,
        "to_currency": rate_data.to_currency,
        "rate": rate_data.rate,
        "rate_date": rate_data.rate_date.isoformat(),
        "source": "manual",
    }

    result = db.table("exchange_rates").upsert(data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create exchange rate")

    return ExchangeRate(**result.data[0])
