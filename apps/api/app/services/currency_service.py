import httpx
from datetime import date, timedelta
from typing import Optional, Dict
from psycopg import AsyncConnection
from app.config import get_settings
from app.db import Row, fetch_one

settings = get_settings()

# In-memory cache for exchange rates
_rate_cache: Dict[str, tuple[float, date]] = {}


async def get_personal_rate(
    db: AsyncConnection,
    from_currency: str,
    to_currency: str,
    rate_date: date,
) -> Optional[float]:
    """
    The user's own rate: the latest manually recorded rate (a real exchange-office
    visit) dated on or before rate_date. Either direction of the pair matches.
    """
    row = await fetch_one(
        db,
        "SELECT from_currency, rate FROM exchange_rates "
        "WHERE source = 'manual' AND rate_date <= %s AND rate > 0 "
        "AND ((from_currency = %s AND to_currency = %s) "
        "  OR (from_currency = %s AND to_currency = %s)) "
        "ORDER BY rate_date DESC, created_at DESC LIMIT 1",
        [rate_date, from_currency, to_currency, to_currency, from_currency],
    )
    if not row:
        return None
    rate = float(row["rate"])
    return rate if row["from_currency"] == from_currency else 1 / rate


async def get_exchange_rate(
    from_currency: str,
    to_currency: str,
    rate_date: Optional[date] = None,
    db: Optional[AsyncConnection] = None,
) -> float:
    """
    Get the rate to convert from_currency to to_currency: the user's own rate
    when one is recorded, otherwise the market rate.
    """
    if from_currency == to_currency:
        return 1.0

    if rate_date is None:
        rate_date = date.today()

    if db:
        personal = await get_personal_rate(db, from_currency, to_currency, rate_date)
        if personal is not None:
            return personal

    return await get_market_rate(from_currency, to_currency, rate_date, db)


async def get_market_rate(
    from_currency: str,
    to_currency: str,
    rate_date: date,
    db: Optional[AsyncConnection] = None,
) -> float:
    """
    Get market exchange rate with three-tier caching:
    1. In-memory cache
    2. Database cache
    3. Frankfurter API
    """

    cache_key = f"{from_currency}_{to_currency}_{rate_date}"

    # Check in-memory cache
    if cache_key in _rate_cache:
        cached_rate, cached_date = _rate_cache[cache_key]
        # Use cache if less than 1 hour old for today, or permanent for past dates
        if rate_date < date.today() or (date.today() - cached_date).days == 0:
            return cached_rate

    # Check database cache
    if db:
        row = await fetch_one(
            db,
            "SELECT rate FROM exchange_rates "
            "WHERE from_currency = %s AND to_currency = %s AND rate_date = %s",
            [from_currency, to_currency, rate_date],
        )

        if row:
            rate = float(row["rate"])
            _rate_cache[cache_key] = (rate, date.today())
            return rate

    # Fetch from Frankfurter API
    try:
        rate = await fetch_rate_from_api(from_currency, to_currency, rate_date)

        # Store in database
        if db:
            await save_exchange_rate(
                db, from_currency, to_currency, rate, rate_date, "frankfurter"
            )

        # Store in memory cache
        _rate_cache[cache_key] = (rate, date.today())

        return rate
    except Exception as e:
        # Fallback: try to get the most recent rate from database
        if db:
            row = await fetch_one(
                db,
                "SELECT rate FROM exchange_rates "
                "WHERE from_currency = %s AND to_currency = %s "
                "ORDER BY rate_date DESC LIMIT 1",
                [from_currency, to_currency],
            )

            if row:
                return float(row["rate"])

        raise Exception(f"Could not get exchange rate: {e}")


async def save_exchange_rate(
    db: AsyncConnection,
    from_currency: str,
    to_currency: str,
    rate: float,
    rate_date: date,
    source: str,
) -> Row:
    """Insert or update the stored rate for a currency pair and date."""
    row = await fetch_one(
        db,
        "INSERT INTO exchange_rates (from_currency, to_currency, rate, rate_date, source) "
        "VALUES (%s, %s, %s, %s, %s) "
        "ON CONFLICT (from_currency, to_currency, rate_date) "
        "DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source "
        "RETURNING *",
        [from_currency, to_currency, rate, rate_date, source],
    )
    assert row is not None
    return row


async def fetch_rate_from_api(
    from_currency: str,
    to_currency: str,
    rate_date: date,
) -> float:
    """Fetch exchange rate from Frankfurter API."""
    # Use latest endpoint for today, historical for past dates
    if rate_date >= date.today():
        url = f"{settings.frankfurter_api_url}/latest"
    else:
        url = f"{settings.frankfurter_api_url}/{rate_date.isoformat()}"

    params = {"from": from_currency, "to": to_currency}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
        data = response.json()

        if to_currency in data.get("rates", {}):
            return data["rates"][to_currency]

        raise Exception(f"Rate not found for {from_currency} to {to_currency}")


async def convert_amount(
    amount: float,
    from_currency: str,
    to_currency: str,
    rate_date: Optional[date] = None,
    db: Optional[AsyncConnection] = None,
    manual_rate: Optional[float] = None,
) -> tuple[float, float, str]:
    """
    Convert amount from one currency to another. Precedence: explicit manual_rate,
    the user's own recorded rate, the market rate.

    Returns: (converted_amount, exchange_rate, rate_source)
    """
    if from_currency == to_currency:
        return amount, 1.0, "same_currency"

    if manual_rate is not None:
        return amount * manual_rate, manual_rate, "manual"

    if rate_date is None:
        rate_date = date.today()

    if db:
        personal = await get_personal_rate(db, from_currency, to_currency, rate_date)
        if personal is not None:
            return amount * personal, personal, "personal"

    rate = await get_market_rate(from_currency, to_currency, rate_date, db)
    return amount * rate, rate, "frankfurter"


def clear_rate_cache():
    """Clear the in-memory rate cache."""
    global _rate_cache
    _rate_cache = {}
