from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Account, AccountCreate, AccountUpdate, AccountBalance
from app.services.currency_service import get_exchange_rate

router = APIRouter()


@router.get("", response_model=List[Account])
async def list_accounts(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List all accounts for the current user."""
    result = db.table("accounts").select("*").eq("user_id", current_user.id).order("sort_order").execute()

    accounts = []
    for acc in result.data:
        # Calculate EUR equivalent if different currency
        current_balance_eur = acc["current_balance"]
        if acc["currency_code"] != "EUR":
            try:
                rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
                current_balance_eur = acc["current_balance"] * rate
            except Exception:
                pass

        accounts.append(Account(
            **acc,
            current_balance_eur=current_balance_eur,
        ))

    return accounts


@router.get("/balances", response_model=List[AccountBalance])
async def get_account_balances(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get all account balances with EUR equivalents."""
    result = db.table("accounts").select("*").eq("user_id", current_user.id).eq("is_active", True).order("sort_order").execute()

    balances = []
    for acc in result.data:
        current_balance_eur = acc["current_balance"]
        if acc["currency_code"] != "EUR":
            try:
                rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
                current_balance_eur = acc["current_balance"] * rate
            except Exception:
                pass

        balances.append(AccountBalance(
            **acc,
            current_balance_eur=current_balance_eur,
            pending_transactions=0,
        ))

    return balances


@router.get("/{account_id}", response_model=Account)
async def get_account(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a specific account."""
    result = db.table("accounts").select("*").eq("id", account_id).eq("user_id", current_user.id).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    acc = result.data[0]
    current_balance_eur = acc["current_balance"]
    if acc["currency_code"] != "EUR":
        try:
            rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
            current_balance_eur = acc["current_balance"] * rate
        except Exception:
            pass

    return Account(**acc, current_balance_eur=current_balance_eur)


@router.post("", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_account(
    account: AccountCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new account."""
    data = {
        "user_id": current_user.id,
        "name": account.name,
        "type": account.type,
        "currency_code": account.currency_code,
        "initial_balance": account.initial_balance,
        "current_balance": account.initial_balance,
        "icon": account.icon,
        "color": account.color,
    }

    result = db.table("accounts").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create account")

    acc = result.data[0]
    current_balance_eur = acc["current_balance"]
    if acc["currency_code"] != "EUR":
        try:
            rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
            current_balance_eur = acc["current_balance"] * rate
        except Exception:
            pass

    return Account(**acc, current_balance_eur=current_balance_eur)


@router.patch("/{account_id}", response_model=Account)
async def update_account(
    account_id: str,
    account: AccountUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update an account."""
    # Verify ownership
    existing = db.table("accounts").select("id").eq("id", account_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    update_data = account.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = db.table("accounts").update(update_data).eq("id", account_id).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update account")

    acc = result.data[0]
    current_balance_eur = acc["current_balance"]
    if acc["currency_code"] != "EUR":
        try:
            rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
            current_balance_eur = acc["current_balance"] * rate
        except Exception:
            pass

    return Account(**acc, current_balance_eur=current_balance_eur)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete an account."""
    # Verify ownership
    existing = db.table("accounts").select("id").eq("id", account_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Check for transactions
    transactions = db.table("transactions").select("id").eq("account_id", account_id).limit(1).execute()
    if transactions.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete account with transactions. Delete transactions first or mark account as inactive.",
        )

    db.table("accounts").delete().eq("id", account_id).execute()
