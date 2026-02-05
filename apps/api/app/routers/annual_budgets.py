from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import AnnualBudget, AnnualBudgetCreate, AnnualBudgetUpdate
from supabase import Client

router = APIRouter()


@router.get("", response_model=List[AnnualBudget])
async def list_annual_budgets(
    year: Optional[str] = Query(None, description="Filter by year (e.g. 2026)"),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List annual budgets with calculated spent amounts."""
    query = (
        db.table("annual_budgets")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at")
    )

    if year:
        query = query.eq("year", year)

    result = query.execute()

    budgets = []
    for b in result.data:
        # Calculate spent_amount from linked transactions
        spent_result = (
            db.table("transactions")
            .select("amount_base_eur")
            .eq("annual_budget_id", b["id"])
            .execute()
        )
        spent_amount = sum(abs(t["amount_base_eur"]) for t in spent_result.data)

        budgets.append(
            AnnualBudget(
                id=b["id"],
                user_id=b["user_id"],
                name=b["name"],
                year=b["year"],
                amount_planned=b["amount_planned"],
                spent_amount=spent_amount,
                is_active=b["is_active"],
                created_at=b["created_at"],
                updated_at=b["updated_at"],
            )
        )

    return budgets


@router.post("", response_model=AnnualBudget, status_code=status.HTTP_201_CREATED)
async def create_annual_budget(
    budget: AnnualBudgetCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new annual budget."""
    data = {
        "user_id": current_user.id,
        "name": budget.name,
        "year": budget.year,
        "amount_planned": budget.amount_planned,
    }

    result = db.table("annual_budgets").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create annual budget",
        )

    new_budget = result.data[0]
    return AnnualBudget(
        id=new_budget["id"],
        user_id=new_budget["user_id"],
        name=new_budget["name"],
        year=new_budget["year"],
        amount_planned=new_budget["amount_planned"],
        spent_amount=0,
        is_active=new_budget["is_active"],
        created_at=new_budget["created_at"],
        updated_at=new_budget["updated_at"],
    )


@router.get("/{budget_id}", response_model=AnnualBudget)
async def get_annual_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a single annual budget with calculated spent amount."""
    result = (
        db.table("annual_budgets")
        .select("*")
        .eq("id", budget_id)
        .eq("user_id", current_user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    b = result.data[0]

    # Calculate spent_amount
    spent_result = (
        db.table("transactions")
        .select("amount_base_eur")
        .eq("annual_budget_id", b["id"])
        .execute()
    )
    spent_amount = sum(abs(t["amount_base_eur"]) for t in spent_result.data)

    return AnnualBudget(
        id=b["id"],
        user_id=b["user_id"],
        name=b["name"],
        year=b["year"],
        amount_planned=b["amount_planned"],
        spent_amount=spent_amount,
        is_active=b["is_active"],
        created_at=b["created_at"],
        updated_at=b["updated_at"],
    )


@router.patch("/{budget_id}", response_model=AnnualBudget)
async def update_annual_budget(
    budget_id: str,
    budget: AnnualBudgetUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update an annual budget."""
    # Verify ownership
    existing = (
        db.table("annual_budgets")
        .select("id")
        .eq("id", budget_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    update_data = budget.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    result = (
        db.table("annual_budgets").update(update_data).eq("id", budget_id).execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update annual budget",
        )

    return await get_annual_budget(budget_id, current_user, db)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_annual_budget(
    budget_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete an annual budget. Checks for linked transactions first."""
    # Verify ownership
    existing = (
        db.table("annual_budgets")
        .select("id")
        .eq("id", budget_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
        )

    # Check for linked transactions
    transactions = (
        db.table("transactions")
        .select("id")
        .eq("annual_budget_id", budget_id)
        .limit(1)
        .execute()
    )
    if transactions.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete annual budget with linked transactions. Remove annual budget from transactions first.",
        )

    db.table("annual_budgets").delete().eq("id", budget_id).execute()
