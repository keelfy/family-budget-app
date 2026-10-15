from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from psycopg import AsyncConnection
from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Account, AccountCreate, AccountUpdate, AccountBalance
from app.services.currency_service import get_exchange_rate

router = APIRouter()


async def _balance_eur(acc: dict, db: AsyncConnection) -> float:
    """Account balance converted to EUR (falls back to the raw balance if no rate)."""
    if acc["currency_code"] == "EUR":
        return acc["current_balance"]
    try:
        rate = await get_exchange_rate(acc["currency_code"], "EUR", db=db)
        return acc["current_balance"] * rate
    except Exception:
        return acc["current_balance"]


@router.get("", response_model=List[Account])
async def list_accounts(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all accounts for the current user."""
    rows = await fetch_all(
        db,
        "SELECT * FROM accounts WHERE user_id = %s ORDER BY sort_order",
        [current_user.id],
    )

    return [Account(**acc, current_balance_eur=await _balance_eur(acc, db)) for acc in rows]


@router.get("/balances", response_model=List[AccountBalance])
async def get_account_balances(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get all account balances with EUR equivalents."""
    rows = await fetch_all(
        db,
        "SELECT * FROM accounts WHERE user_id = %s AND is_active ORDER BY sort_order",
        [current_user.id],
    )

    return [
        AccountBalance(
            **acc,
            current_balance_eur=await _balance_eur(acc, db),
            pending_transactions=0,
        )
        for acc in rows
    ]


@router.get("/{account_id}", response_model=Account)
async def get_account(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a specific account."""
    acc = await fetch_one(
        db,
        "SELECT * FROM accounts WHERE id = %s AND user_id = %s",
        [account_id, current_user.id],
    )

    if not acc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    return Account(**acc, current_balance_eur=await _balance_eur(acc, db))


@router.post("", response_model=Account, status_code=status.HTTP_201_CREATED)
async def create_account(
    account: AccountCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new account."""
    acc = await insert(
        db,
        "accounts",
        {
            "user_id": current_user.id,
            "name": account.name,
            "type": account.type,
            "currency_code": account.currency_code,
            "initial_balance": account.initial_balance,
            "current_balance": account.initial_balance,
            "icon": account.icon,
            "color": account.color,
        },
    )

    return Account(**acc, current_balance_eur=await _balance_eur(acc, db))


@router.patch("/{account_id}", response_model=Account)
async def update_account(
    account_id: str,
    account: AccountUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update an account."""
    update_data = account.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    acc = await update(
        db, "accounts", update_data, {"id": account_id, "user_id": current_user.id}
    )
    if not acc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    return Account(**acc, current_balance_eur=await _balance_eur(acc, db))


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    account_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete an account."""
    existing = await fetch_one(
        db,
        "SELECT id FROM accounts WHERE id = %s AND user_id = %s",
        [account_id, current_user.id],
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    has_transactions = await fetch_one(
        db, "SELECT 1 FROM transactions WHERE account_id = %s LIMIT 1", [account_id]
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete account with transactions. Delete transactions first or mark account as inactive.",
        )

    await execute(db, "DELETE FROM accounts WHERE id = %s", [account_id])
