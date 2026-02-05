from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import AllowanceCreate, AllowanceUpdate, AllowanceDefinition, AllowanceBalance
from supabase import Client

router = APIRouter()


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
    db: Client = Depends(get_db),
):
    """List all allowance balances for a period, joined with allowance names."""
    if not period:
        period = get_current_period()

    result = (
        db.table("allowance_balances")
        .select("*, allowances!inner(name)")
        .eq("user_id", current_user.id)
        .eq("period", period)
        .execute()
    )

    balances = []
    for b in result.data:
        balances.append(
            AllowanceBalance(
                id=b["id"],
                user_id=b["user_id"],
                allowance_id=b["allowance_id"],
                allowance_name=b["allowances"]["name"] if b.get("allowances") else None,
                period=b["period"],
                monthly_limit=b["monthly_limit"],
                carry_over_from_previous=b["carry_over_from_previous"],
                spent_amount=b["spent_amount"],
                created_at=b["created_at"],
                updated_at=b["updated_at"],
            )
        )

    return balances


@router.post("/balances/{balance_id}/recalculate", response_model=AllowanceBalance)
async def recalculate_allowance_balance(
    balance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Recalculate spent_amount for a single allowance balance from transactions."""
    # Fetch the balance row and verify ownership
    result = (
        db.table("allowance_balances")
        .select("*, allowances!inner(name)")
        .eq("id", balance_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Allowance balance not found",
        )

    b = result.data[0]

    # Sum transactions for this allowance + period
    tx_result = (
        db.table("transactions")
        .select("amount_base_eur")
        .eq("allowance_id", b["allowance_id"])
        .eq("accounting_period", b["period"])
        .execute()
    )
    spent = sum(abs(t["amount_base_eur"]) for t in tx_result.data)

    # Update the balance row
    db.table("allowance_balances").update({"spent_amount": spent}).eq("id", balance_id).execute()

    return AllowanceBalance(
        id=b["id"],
        user_id=b["user_id"],
        allowance_id=b["allowance_id"],
        allowance_name=b["allowances"]["name"] if b.get("allowances") else None,
        period=b["period"],
        monthly_limit=b["monthly_limit"],
        carry_over_from_previous=b["carry_over_from_previous"],
        spent_amount=spent,
        created_at=b["created_at"],
        updated_at=b["updated_at"],
    )


@router.post("/rollover", status_code=status.HTTP_200_OK)
async def trigger_rollover(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """
    Trigger month rollover for all of the user's active allowances.
    Creates new allowance_balances rows for current period with carry-over calculated.
    """
    current_period = get_current_period()
    prev_period = get_previous_period(current_period)

    # Get user's active allowances
    allowances_result = (
        db.table("allowances")
        .select("*")
        .eq("user_id", current_user.id)
        .eq("is_active", True)
        .execute()
    )

    created = 0
    updated = 0
    for allowance in allowances_result.data:
        # Calculate carry-over from previous period
        prev_result = (
            db.table("allowance_balances")
            .select("*")
            .eq("allowance_id", allowance["id"])
            .eq("period", prev_period)
            .execute()
        )

        carry_over = 0
        if prev_result.data:
            prev = prev_result.data[0]
            total_available = prev["monthly_limit"] + prev["carry_over_from_previous"]
            carry_over = max(0, total_available - prev["spent_amount"])

        # Check if current period already exists for this allowance
        existing = (
            db.table("allowance_balances")
            .select("id")
            .eq("allowance_id", allowance["id"])
            .eq("period", current_period)
            .execute()
        )

        if existing.data:
            # Re-calculate carry-over on existing record
            db.table("allowance_balances").update({
                "monthly_limit": allowance["monthly_limit"],
                "carry_over_from_previous": carry_over,
            }).eq("id", existing.data[0]["id"]).execute()
            updated += 1
        else:
            new_balance = {
                "user_id": current_user.id,
                "allowance_id": allowance["id"],
                "period": current_period,
                "monthly_limit": allowance["monthly_limit"],
                "carry_over_from_previous": carry_over,
                "spent_amount": 0,
            }

            db.table("allowance_balances").insert(new_balance).execute()
            created += 1

    return {"message": f"Rollover complete. Created {created}, updated {updated} allowance balance records."}


# --- CRUD for allowance definitions ---


@router.get("", response_model=List[AllowanceDefinition])
async def list_allowances(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List all allowance definitions for current user."""
    result = (
        db.table("allowances")
        .select("*")
        .eq("user_id", current_user.id)
        .order("created_at")
        .execute()
    )

    return [AllowanceDefinition(**a) for a in result.data]


@router.post("", response_model=AllowanceDefinition, status_code=status.HTTP_201_CREATED)
async def create_allowance(
    allowance: AllowanceCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new named allowance."""
    data = {
        "user_id": current_user.id,
        "name": allowance.name,
        "monthly_limit": allowance.monthly_limit,
    }

    result = db.table("allowances").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create allowance",
        )

    # Create an initial balance row for the current period so it appears immediately
    new_allowance = result.data[0]
    current_period = get_current_period()
    db.table("allowance_balances").insert({
        "user_id": current_user.id,
        "allowance_id": new_allowance["id"],
        "period": current_period,
        "monthly_limit": allowance.monthly_limit,
        "carry_over_from_previous": 0,
        "spent_amount": 0,
    }).execute()

    return AllowanceDefinition(**new_allowance)


@router.get("/{allowance_id}", response_model=AllowanceDefinition)
async def get_allowance(
    allowance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a single allowance definition."""
    result = (
        db.table("allowances")
        .select("*")
        .eq("id", allowance_id)
        .eq("user_id", current_user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    return AllowanceDefinition(**result.data[0])


@router.patch("/{allowance_id}", response_model=AllowanceDefinition)
async def update_allowance(
    allowance_id: str,
    allowance: AllowanceUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update an allowance definition."""
    # Verify ownership
    existing = (
        db.table("allowances")
        .select("id")
        .eq("id", allowance_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    update_data = allowance.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    result = (
        db.table("allowances").update(update_data).eq("id", allowance_id).execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update allowance",
        )

    return AllowanceDefinition(**result.data[0])


@router.delete("/{allowance_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_allowance(
    allowance_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete an allowance definition. Checks for linked transactions first."""
    # Verify ownership
    existing = (
        db.table("allowances")
        .select("id")
        .eq("id", allowance_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
        )

    # Check for linked transactions
    transactions = (
        db.table("transactions")
        .select("id")
        .eq("allowance_id", allowance_id)
        .limit(1)
        .execute()
    )
    if transactions.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete allowance with linked transactions. Remove allowance from transactions first.",
        )

    db.table("allowances").delete().eq("id", allowance_id).execute()
