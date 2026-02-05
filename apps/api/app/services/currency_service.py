import httpx
from datetime import date, timedelta
from typing import Optional, Dict
from functools import lru_cache
from supabase import Client
from app.config import get_settings

settings = get_settings()

# In-memory cache for exchange rates
_rate_cache: Dict[str, tuple[float, date]] = {}


async def get_exchange_rate(
    from_currency: str,
    to_currency: str,
    rate_date: Optional[date] = None,
    db: Optional[Client] = None,
) -> float:
    """
    Get exchange rate with three-tier caching:
    1. In-memory cache
    2. Database cache
    3. Frankfurter API

    Returns rate to convert from_currency to to_currency.
    """
    if from_currency == to_currency:
        return 1.0

    if rate_date is None:
        rate_date = date.today()

    cache_key = f"{from_currency}_{to_currency}_{rate_date}"

    # Check in-memory cache
    if cache_key in _rate_cache:
        cached_rate, cached_date = _rate_cache[cache_key]
        # Use cache if less than 1 hour old for today, or permanent for past dates
        if rate_date < date.today() or (date.today() - cached_date).days == 0:
            return cached_rate

    # Check database cache
    if db:
        result = db.table("exchange_rates").select("rate").eq(
            "from_currency", from_currency
        ).eq("to_currency", to_currency).eq("rate_date", rate_date.isoformat()).execute()

        if result.data:
            rate = float(result.data[0]["rate"])
            _rate_cache[cache_key] = (rate, date.today())
            return rate

    # Fetch from Frankfurter API
    try:
        rate = await fetch_rate_from_api(from_currency, to_currency, rate_date)

        # Store in database
        if db:
            db.table("exchange_rates").upsert({
                "from_currency": from_currency,
                "to_currency": to_currency,
                "rate": rate,
                "rate_date": rate_date.isoformat(),
                "source": "frankfurter",
            }).execute()

        # Store in memory cache
        _rate_cache[cache_key] = (rate, date.today())

        return rate
    except Exception as e:
        # Fallback: try to get the most recent rate from database
        if db:
            result = db.table("exchange_rates").select("rate").eq(
                "from_currency", from_currency
            ).eq("to_currency", to_currency).order("rate_date", desc=True).limit(1).execute()

            if result.data:
                return float(result.data[0]["rate"])

        raise Exception(f"Could not get exchange rate: {e}")


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
    db: Optional[Client] = None,
    manual_rate: Optional[float] = None,
) -> tuple[float, float, str]:
    """
    Convert amount from one currency to another.

    Returns: (converted_amount, exchange_rate, rate_source)
    """
    if from_currency == to_currency:
        return amount, 1.0, "same_currency"

    if manual_rate is not None:
        return amount * manual_rate, manual_rate, "manual"

    rate = await get_exchange_rate(from_currency, to_currency, rate_date, db)
    return amount * rate, rate, "frankfurter"


def clear_rate_cache():
    """Clear the in-memory rate cache."""
    global _rate_cache
    _rate_cache = {}
