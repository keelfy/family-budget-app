from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection

from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import AnnualBudget, AnnualBudgetCreate, AnnualBudgetUpdate

router = APIRouter()

# spent_amount is calculated from linked transactions
_ANNUAL_BUDGET_SELECT = """
    SELECT b.*,
           COALESCE((
               SELECT SUM(ABS(t.amount_base_eur))
               FROM transactions t
               WHERE t.annual_budget_id = b.id
           ), 0) AS spent_amount
    FROM annual_budgets b
"""


@router.get("", response_model=List[AnnualBudget])
async def list_annual_budgets(
    year: Optional[str] = Query(None, description="Filter by year (e.g. 2026)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List annual budgets with calculated spent amounts."""
    conditions = ["b.family_id = %s"]
    params: list = [current_user.family_id]
    if year:
        conditions.append("b.year = %s")
        params.append(year)

    rows = await fetch_all(
        db,
        f"{_ANNUAL_BUDGET_SELECT} WHERE {' AND '.join(conditions)} ORDER BY b.created_at",
        params,
    )

    return [AnnualBudget(**b) for b in rows]


@router.post("", response_model=AnnualBudget, status_code=status.HTTP_201_CREATED)
async def create_annual_budget(
    budget: AnnualBudgetCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new annual budget."""
    new_budget = await insert(
        db,
        "annual_budgets",
        {
            "user_id": current_user.id,
            "family_id": current_user.family_id,
            "name": budget.name,
            "year": budget.year,
            "amount_planned": budget.amount_planned,
        },
    )

    return AnnualBudget(**new_budget, spent_amount=0)


@router.get("/{budget_id}", response_model=AnnualBudget)
async def get_annual_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a single annual budget with calculated spent amount."""
    row = await fetch_one(
        db,
        f"{_ANNUAL_BUDGET_SELECT} WHERE b.id = %s AND b.family_id = %s",
        [budget_id, current_user.family_id],
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    return AnnualBudget(**row)


@router.patch("/{budget_id}", response_model=AnnualBudget)
async def update_annual_budget(
    budget_id: str,
    budget: AnnualBudgetUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update an annual budget."""
    update_data = budget.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    updated = await update(
        db,
        "annual_budgets",
        update_data,
        {"id": budget_id, "family_id": current_user.family_id},
    )
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    return await get_annual_budget(budget_id, current_user, db)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annual_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete an annual budget. Checks for linked transactions first."""
    existing = await fetch_one(
        db,
        "SELECT id FROM annual_budgets WHERE id = %s AND family_id = %s",
        [budget_id, current_user.family_id],
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    has_transactions = await fetch_one(
        db, "SELECT 1 FROM transactions WHERE annual_budget_id = %s LIMIT 1", [budget_id]
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete annual budget with linked transactions. Remove annual budget from transactions first.",
        )

    await execute(db, "DELETE FROM annual_budgets WHERE id = %s", [budget_id])
