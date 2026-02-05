from fastapi import APIRouter, Depends, HTTPException, status, Query
from typing import List, Optional
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Budget, BudgetCreate, BudgetUpdate, BudgetComparison, BudgetCopy

router = APIRouter()


@router.get("", response_model=List[Budget])
async def list_budgets(
    period: Optional[str] = Query(None, description="Filter by period (YYYY-MM)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List all budgets for the current user."""
    query = db.table("budgets").select(
        "*, categories!inner(name)"
    ).eq("user_id", current_user.id)

    if period:
        query = query.eq("period", period)

    result = query.order("period", desc=True).execute()

    budgets = []
    for b in result.data:
        # Calculate spent amount for this budget
        transactions = db.table("transactions").select("amount_base_eur").eq(
            "user_id", current_user.id
        ).eq("category_id", b["category_id"]).eq("accounting_period", b["period"]).execute()

        spent = sum(abs(t["amount_base_eur"]) for t in transactions.data)

        budgets.append(Budget(
            id=b["id"],
            user_id=b["user_id"],
            category_id=b["category_id"],
            category_name=b["categories"]["name"] if b.get("categories") else None,
            period=b["period"],
            amount_planned=b["amount_planned"],
            spent_amount=spent,
            created_at=b["created_at"],
            updated_at=b["updated_at"],
        ))

    return budgets


@router.get("/comparison", response_model=List[BudgetComparison])
async def get_budget_comparison(
    period: str = Query(..., description="Period to compare (YYYY-MM)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
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


@router.post("", response_model=Budget, status_code=status.HTTP_201_CREATED)
async def create_budget(
    budget: BudgetCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new budget."""
    # Verify category exists
    category = db.table("categories").select("id, name").eq("id", budget.category_id).execute()
    if not category.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    # Check for existing budget
    existing = db.table("budgets").select("id").eq(
        "user_id", current_user.id
    ).eq("category_id", budget.category_id).eq("period", budget.period).execute()

    if existing.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Budget already exists for this category and period")

    data = {
        "user_id": current_user.id,
        "category_id": budget.category_id,
        "period": budget.period,
        "amount_planned": budget.amount_planned,
    }

    result = db.table("budgets").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create budget")

    return Budget(
        **result.data[0],
        category_name=category.data[0]["name"],
        spent_amount=0,
    )


@router.patch("/{budget_id}", response_model=Budget)
async def update_budget(
    budget_id: str,
    budget: BudgetUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update a budget."""
    # Verify ownership
    existing = db.table("budgets").select("*").eq("id", budget_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")

    result = db.table("budgets").update({
        "amount_planned": budget.amount_planned
    }).eq("id", budget_id).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update budget")

    # Get category name
    category = db.table("categories").select("name").eq("id", result.data[0]["category_id"]).execute()

    # Calculate spent
    transactions = db.table("transactions").select("amount_base_eur").eq(
        "user_id", current_user.id
    ).eq("category_id", result.data[0]["category_id"]).eq("accounting_period", result.data[0]["period"]).execute()

    spent = sum(abs(t["amount_base_eur"]) for t in transactions.data)

    return Budget(
        **result.data[0],
        category_name=category.data[0]["name"] if category.data else None,
        spent_amount=spent,
    )


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete a budget."""
    existing = db.table("budgets").select("id").eq("id", budget_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Budget not found")

    db.table("budgets").delete().eq("id", budget_id).execute()


@router.post("/copy", response_model=List[Budget])
async def copy_budgets(
    copy_data: BudgetCopy,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Copy budgets from one period to another."""
    # Get source budgets
    source_budgets = db.table("budgets").select("*").eq(
        "user_id", current_user.id
    ).eq("period", copy_data.from_period).execute()

    if not source_budgets.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No budgets found in source period")

    created_budgets = []
    for budget in source_budgets.data:
        # Check if budget already exists in target period
        existing = db.table("budgets").select("id").eq(
            "user_id", current_user.id
        ).eq("category_id", budget["category_id"]).eq("period", copy_data.to_period).execute()

        if not existing.data:
            new_budget = {
                "user_id": current_user.id,
                "category_id": budget["category_id"],
                "period": copy_data.to_period,
                "amount_planned": budget["amount_planned"],
            }
            result = db.table("budgets").insert(new_budget).execute()
            if result.data:
                created_budgets.append(result.data[0])

    return await list_budgets(copy_data.to_period, current_user, db)
