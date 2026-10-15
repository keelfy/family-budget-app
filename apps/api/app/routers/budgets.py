from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from psycopg import AsyncConnection
from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Budget, BudgetCreate, BudgetUpdate, BudgetComparison, BudgetCopy

router = APIRouter()

_BUDGET_SELECT = """
    SELECT b.*,
           c.name AS category_name,
           COALESCE((
               SELECT SUM(v.amount_eur)
               FROM transaction_category_amounts v
               WHERE v.family_id = b.family_id
                 AND v.category_id = b.category_id
                 AND v.accounting_period = b.period
           ), 0) AS spent_amount
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
"""


@router.get("", response_model=List[Budget])
async def list_budgets(
    period: Optional[str] = Query(None, description="Filter by period (YYYY-MM)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all budgets for the current user."""
    conditions = ["b.family_id = %s"]
    params: list = [current_user.family_id]
    if period:
        conditions.append("b.period = %s")
        params.append(period)

    rows = await fetch_all(
        db,
        f"{_BUDGET_SELECT} WHERE {' AND '.join(conditions)} ORDER BY b.period DESC",
        params,
    )

    return [Budget(**b) for b in rows]


@router.get("/comparison", response_model=List[BudgetComparison])
async def get_budget_comparison(
    period: str = Query(..., description="Period to compare (YYYY-MM)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get budget vs actual comparison for a period."""
    budgets = await list_budgets(period, current_user, db)

    comparisons = []
    for budget in budgets:
        remaining = budget.amount_planned - budget.spent_amount
        percentage = (budget.spent_amount / budget.amount_planned * 100) if budget.amount_planned > 0 else 0

        comparisons.append(BudgetComparison(
            **budget.model_dump(),
            remaining=remaining,
            percentage=round(percentage, 1),
        ))

    return comparisons


async def _get_budget(budget_id: str, family_id: str, db: AsyncConnection) -> Budget:
    row = await fetch_one(
        db,
        f"{_BUDGET_SELECT} WHERE b.id = %s AND b.family_id = %s",
        [budget_id, family_id],
    )
    return Budget(**row)


@router.post("", response_model=Budget, status_code=status.HTTP_201_CREATED)
async def create_budget(
    budget: BudgetCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new budget."""
    # Verify category is visible to the user
    category = await fetch_one(
        db,
        "SELECT id FROM categories WHERE id = %s AND (family_id IS NULL OR family_id = %s)",
        [budget.category_id, current_user.family_id],
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    # Check for existing budget
    existing = await fetch_one(
        db,
        "SELECT id FROM budgets WHERE family_id = %s AND category_id = %s AND period = %s",
        [current_user.family_id, budget.category_id, budget.period],
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget already exists for this category and period")

    created = await insert(
        db,
        "budgets",
        {
            "user_id": current_user.id,
            "family_id": current_user.family_id,
            "category_id": budget.category_id,
            "period": budget.period,
            "amount_planned": budget.amount_planned,
        },
    )

    return await _get_budget(created["id"], current_user.family_id, db)


@router.patch("/{budget_id}", response_model=Budget)
async def update_budget(
    budget_id: str,
    budget: BudgetUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a budget."""
    updated = await update(
        db,
        "budgets",
        {"amount_planned": budget.amount_planned},
        {"id": budget_id, "family_id": current_user.family_id},
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")

    return await _get_budget(budget_id, current_user.family_id, db)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a budget."""
    existing = await fetch_one(
        db,
        "SELECT id FROM budgets WHERE id = %s AND family_id = %s",
        [budget_id, current_user.family_id],
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")

    await execute(db, "DELETE FROM budgets WHERE id = %s", [budget_id])


@router.post("/copy", response_model=List[Budget])
async def copy_budgets(
    copy_data: BudgetCopy,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Copy budgets from one period to another."""
    source_budgets = await fetch_all(
        db,
        "SELECT category_id, amount_planned FROM budgets WHERE family_id = %s AND period = %s",
        [current_user.family_id, copy_data.from_period],
    )

    if not source_budgets:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No budgets found in source period")

    # Skip categories that already have a budget in the target period
    await execute(
        db,
        "INSERT INTO budgets (user_id, family_id, category_id, period, amount_planned) "
        "SELECT %s, family_id, category_id, %s, amount_planned FROM budgets "
        "WHERE family_id = %s AND period = %s "
        "ON CONFLICT (family_id, category_id, period) DO NOTHING",
        [current_user.id, copy_data.to_period, current_user.family_id, copy_data.from_period],
    )

    return await list_budgets(copy_data.to_period, current_user, db)
