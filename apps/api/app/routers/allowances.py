from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection

from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import AllowanceCreate, AllowanceUpdate, AllowanceDefinition, AllowanceBalance

router = APIRouter()

_BALANCE_SELECT = """
    SELECT b.*, a.name AS allowance_name
    FROM allowance_balances b
    JOIN allowances a ON a.id = b.allowance_id
"""


def get_current_period() -> str:
    """Get current period in YYYY-MM format."""
    return date.today().strftime("%Y-%m")


def get_previous_period(period: str) -> str:
    """Get previous period."""
    year, month = map(int, period.split("-"))
    if month == 1:
        return f"{year - 1}-12"
    return f"{year}-{month - 1:02d}"


# --- Static paths BEFORE dynamic {id} paths ---


@router.get("/balances", response_model=List[AllowanceBalance])
async def list_allowance_balances(
    period: Optional[str] = Query(None, description="Period in YYYY-MM format (defaults to current)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all allowance balances for a period, joined with allowance names."""
    if not period:
        period = get_current_period()

    rows = await fetch_all(
        db,
        f"{_BALANCE_SELECT} WHERE b.user_id = %s AND b.period = %s",
        [current_user.id, period],
    )

    return [AllowanceBalance(**b) for b in rows]


@router.post("/balances/{balance_id}/recalculate", response_model=AllowanceBalance)
async def recalculate_allowance_balance(
    balance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Recalculate spent_amount for a single allowance balance from transactions."""
    balance = await fetch_one(
        db,
        f"{_BALANCE_SELECT} WHERE b.id = %s AND b.user_id = %s",
        [balance_id, current_user.id],
    )
    if not balance:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allowance balance not found",
        )

    # Sum transactions for this allowance + period
    spent = (
        await fetch_one(
            db,
            "SELECT COALESCE(SUM(ABS(amount_base_eur)), 0) AS spent "
            "FROM transactions WHERE allowance_id = %s AND accounting_period = %s",
            [balance["allowance_id"], balance["period"]],
        )
    )["spent"]

    await update(db, "allowance_balances", {"spent_amount": spent}, {"id": balance_id})

    return AllowanceBalance(**{**balance, "spent_amount": spent})


@router.post("/rollover", status_code=status.HTTP_200_OK)
async def trigger_rollover(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """
    Trigger month rollover for all of the user's active allowances.
    Creates new allowance_balances rows for current period with carry-over calculated.
    """
    current_period = get_current_period()
    prev_period = get_previous_period(current_period)

    allowances = await fetch_all(
        db,
        "SELECT * FROM allowances WHERE user_id = %s AND is_active",
        [current_user.id],
    )

    created = 0
    updated = 0
    async with db.transaction():
        for allowance in allowances:
            # Calculate carry-over from previous period
            prev = await fetch_one(
                db,
                "SELECT * FROM allowance_balances WHERE allowance_id = %s AND period = %s",
                [allowance["id"], prev_period],
            )

            carry_over = 0
            if prev:
                total_available = prev["monthly_limit"] + prev["carry_over_from_previous"]
                carry_over = max(0, total_available - prev["spent_amount"])

            existing = await fetch_one(
                db,
                "SELECT id FROM allowance_balances WHERE allowance_id = %s AND period = %s",
                [allowance["id"], current_period],
            )

            if existing:
                # Re-calculate carry-over on existing record
                await update(
                    db,
                    "allowance_balances",
                    {
                        "monthly_limit": allowance["monthly_limit"],
                        "carry_over_from_previous": carry_over,
                    },
                    {"id": existing["id"]},
                )
                updated += 1
            else:
                await insert(
                    db,
                    "allowance_balances",
                    {
                        "user_id": current_user.id,
                        "allowance_id": allowance["id"],
                        "period": current_period,
                        "monthly_limit": allowance["monthly_limit"],
                        "carry_over_from_previous": carry_over,
                        "spent_amount": 0,
                    },
                )
                created += 1

    return {"message": f"Rollover complete. Created {created}, updated {updated} allowance balance records."}


# --- CRUD for allowance definitions ---


@router.get("", response_model=List[AllowanceDefinition])
async def list_allowances(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all allowance definitions for current user."""
    rows = await fetch_all(
        db,
        "SELECT * FROM allowances WHERE user_id = %s ORDER BY created_at",
        [current_user.id],
    )

    return [AllowanceDefinition(**a) for a in rows]


@router.post("", response_model=AllowanceDefinition, status_code=status.HTTP_201_CREATED)
async def create_allowance(
    allowance: AllowanceCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new named allowance."""
    async with db.transaction():
        new_allowance = await insert(
            db,
            "allowances",
            {
                "user_id": current_user.id,
                "name": allowance.name,
                "monthly_limit": allowance.monthly_limit,
            },
        )

        # Create an initial balance row for the current period so it appears immediately
        await insert(
            db,
            "allowance_balances",
            {
                "user_id": current_user.id,
                "allowance_id": new_allowance["id"],
                "period": get_current_period(),
                "monthly_limit": allowance.monthly_limit,
                "carry_over_from_previous": 0,
                "spent_amount": 0,
            },
        )

    return AllowanceDefinition(**new_allowance)


@router.get("/{allowance_id}", response_model=AllowanceDefinition)
async def get_allowance(
    allowance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a single allowance definition."""
    row = await fetch_one(
        db,
        "SELECT * FROM allowances WHERE id = %s AND user_id = %s",
        [allowance_id, current_user.id],
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    return AllowanceDefinition(**row)


@router.patch("/{allowance_id}", response_model=AllowanceDefinition)
async def update_allowance(
    allowance_id: str,
    allowance: AllowanceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update an allowance definition."""
    update_data = allowance.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    row = await update(
        db,
        "allowances",
        update_data,
        {"id": allowance_id, "user_id": current_user.id},
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    return AllowanceDefinition(**row)


@router.delete("/{allowance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allowance(
    allowance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete an allowance definition. Checks for linked transactions first."""
    existing = await fetch_one(
        db,
        "SELECT id FROM allowances WHERE id = %s AND user_id = %s",
        [allowance_id, current_user.id],
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    has_transactions = await fetch_one(
        db, "SELECT 1 FROM transactions WHERE allowance_id = %s LIMIT 1", [allowance_id]
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete allowance with linked transactions. Remove allowance from transactions first.",
        )

    await execute(db, "DELETE FROM allowances WHERE id = %s", [allowance_id])
