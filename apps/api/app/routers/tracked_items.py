import calendar
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection

from app.db import Row, execute, fetch_all, fetch_one, insert, update
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import TrackedItem, TrackedItemCreate, TrackedItemUpdate
from app.models.tracked_item import TrackedKind

router = APIRouter()

_MONTHS_PER_CYCLE = {"monthly": 1, "quarterly": 3, "yearly": 12}
_WEEKS_PER_MONTH = 52 / 12

# spent_amount is the sum of linked transactions in the accounting period (%s)
_TRACKED_ITEM_SELECT = """
    SELECT i.*,
           COALESCE((
               SELECT SUM(ABS(t.amount_base_eur))
               FROM transactions t
               WHERE t.tracked_item_id = i.id AND t.accounting_period = %s
           ), 0) AS spent_amount
    FROM tracked_items i
"""


def _add_months(d: date, months: int) -> date:
    year, month = divmod(d.month - 1 + months, 12)
    year, month = d.year + year, month + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def _monthly_cost(amount: float, cycle: str) -> float:
    if cycle == "weekly":
        return round(amount * _WEEKS_PER_MONTH, 2)
    return round(amount / _MONTHS_PER_CYCLE[cycle], 2)


def _next_charge_date(start: date, cycle: str, today: date) -> date:
    """First charge date on or after today, following the cycle from start."""
    if start >= today:
        return start
    if cycle == "weekly":
        weeks = -(-(today - start).days // 7)
        return date.fromordinal(start.toordinal() + weeks * 7)
    step = _MONTHS_PER_CYCLE[cycle]
    cycles = ((today.year - start.year) * 12 + today.month - start.month) // step
    while (candidate := _add_months(start, cycles * step)) < today:
        cycles += 1
    return candidate


def _to_model(row: Row) -> TrackedItem:
    return TrackedItem(
        **row,
        monthly_cost=_monthly_cost(row["amount"], row["cycle"]),
        next_charge_date=_next_charge_date(row["start_date"], row["cycle"], date.today()),
    )


def _current_period() -> str:
    return date.today().strftime("%Y-%m")


@router.get("", response_model=List[TrackedItem])
async def list_tracked_items(
    kind: Optional[TrackedKind] = Query(
        None, description="Only items of this kind (a budget); omit for all kinds"
    ),
    period: Optional[str] = Query(
        None, description="Accounting period (YYYY-MM) for spent_amount; defaults to the current month"
    ),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List tracked items with their spend in a period."""
    conditions = ["i.family_id = %s"]
    params: list = [period or _current_period(), current_user.family_id]
    if kind:
        conditions.append("i.kind = %s")
        params.append(kind)

    rows = await fetch_all(
        db,
        f"{_TRACKED_ITEM_SELECT} WHERE {' AND '.join(conditions)} "
        "ORDER BY i.is_active DESC, i.created_at",
        params,
    )
    return [_to_model(r) for r in rows]


@router.post("", response_model=TrackedItem, status_code=status.HTTP_201_CREATED)
async def create_tracked_item(
    item: TrackedItemCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a tracked item."""
    data = {
        "user_id": current_user.id,
        "family_id": current_user.family_id,
        **item.model_dump(exclude_none=True),
    }
    created = await insert(db, "tracked_items", data)
    return await get_tracked_item(created["id"], None, current_user, db)


@router.get("/{item_id}", response_model=TrackedItem)
async def get_tracked_item(
    item_id: str,
    period: Optional[str] = Query(None, description="Accounting period (YYYY-MM) for spent_amount"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a single tracked item."""
    row = await fetch_one(
        db,
        f"{_TRACKED_ITEM_SELECT} WHERE i.id = %s AND i.family_id = %s",
        [period or _current_period(), item_id, current_user.family_id],
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    return _to_model(row)


@router.patch("/{item_id}", response_model=TrackedItem)
async def update_tracked_item(
    item_id: str,
    item: TrackedItemUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a tracked item."""
    update_data = item.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    updated = await update(
        db,
        "tracked_items",
        update_data,
        {"id": item_id, "family_id": current_user.family_id},
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    return await get_tracked_item(item_id, None, current_user, db)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tracked_item(
    item_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a tracked item. Items with linked transactions can only be deactivated."""
    existing = await fetch_one(
        db,
        "SELECT id FROM tracked_items WHERE id = %s AND family_id = %s",
        [item_id, current_user.family_id],
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")

    has_transactions = await fetch_one(
        db, "SELECT 1 FROM transactions WHERE tracked_item_id = %s LIMIT 1", [item_id]
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete an item with linked transactions. Deactivate it instead.",
        )

    await execute(db, "DELETE FROM tracked_items WHERE id = %s", [item_id])
