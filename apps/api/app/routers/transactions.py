from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import Transaction, TransactionCreate, TransactionUpdate, TransferCreate
from app.services.currency_service import convert_amount
from supabase import Client

router = APIRouter()


def get_accounting_period(transaction_date: date) -> str:
    """Get accounting period from date (YYYY-MM format)."""
    return transaction_date.strftime("%Y-%m")


@router.get("", response_model=List[Transaction])
async def list_transactions(
    period: Optional[str] = Query(
        None, description="Filter by accounting period (YYYY-MM)"
    ),
    account_id: Optional[str] = Query(None, description="Filter by account"),
    category_id: Optional[str] = Query(None, description="Filter by category"),
    allowance_id: Optional[str] = Query(
        None, description="Filter by allowance"
    ),
    annual_budget_id: Optional[str] = Query(
        None, description="Filter by annual budget"
    ),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List transactions with optional filters."""
    query = (
        db.table("transactions")
        .select(
            "*, accounts:accounts!transactions_account_id_fkey!inner(name), categories!inner(name, type), allowances!left(name), annual_budgets!left(name)"
        )
        .eq("user_id", current_user.id)
    )

    if period:
        query = query.eq("accounting_period", period)
    if account_id:
        query = query.eq("account_id", account_id)
    if category_id:
        query = query.eq("category_id", category_id)
    if allowance_id is not None:
        query = query.eq("allowance_id", allowance_id)
    if annual_budget_id is not None:
        query = query.eq("annual_budget_id", annual_budget_id)

    result = (
        query.order("transaction_date", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    transactions = []
    for t in result.data:
        transactions.append(
            Transaction(
                id=t["id"],
                user_id=t["user_id"],
                account_id=t["account_id"],
                account_name=t["accounts"]["name"] if t.get("accounts") else None,
                category_id=t["category_id"],
                category_name=t["categories"]["name"] if t.get("categories") else None,
                category_type=t["categories"]["type"] if t.get("categories") else None,
                allowance_id=t["allowance_id"],
                allowance_name=t["allowances"]["name"] if t.get("allowances") else None,
                annual_budget_id=t["annual_budget_id"],
                annual_budget_name=t["annual_budgets"]["name"] if t.get("annual_budgets") else None,
                amount_original=t["amount_original"],
                currency_original=t["currency_original"],
                amount_base_eur=t["amount_base_eur"],
                exchange_rate=t["exchange_rate"],
                exchange_rate_source=t["exchange_rate_source"],
                transaction_date=t["transaction_date"],
                accounting_period=t["accounting_period"],
                description=t["description"],
                notes=t["notes"],
                transfer_to_account_id=t["transfer_to_account_id"],
                transfer_transaction_id=t["transfer_transaction_id"],
                created_at=t["created_at"],
                updated_at=t["updated_at"],
            )
        )

    return transactions


@router.get("/{transaction_id}", response_model=Transaction)
async def get_transaction(
    transaction_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a specific transaction."""
    result = (
        db.table("transactions")
        .select(
            "*, accounts:accounts!transactions_account_id_fkey!inner(name), categories!inner(name, type), allowances!left(name), annual_budgets!left(name)"
        )
        .eq("id", transaction_id)
        .eq("user_id", current_user.id)
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    t = result.data[0]
    return Transaction(
        id=t["id"],
        user_id=t["user_id"],
        account_id=t["account_id"],
        account_name=t["accounts"]["name"] if t.get("accounts") else None,
        category_id=t["category_id"],
        category_name=t["categories"]["name"] if t.get("categories") else None,
        category_type=t["categories"]["type"] if t.get("categories") else None,
        allowance_id=t["allowance_id"],
        allowance_name=t["allowances"]["name"] if t.get("allowances") else None,
        annual_budget_id=t["annual_budget_id"],
        annual_budget_name=t["annual_budgets"]["name"] if t.get("annual_budgets") else None,
        amount_original=t["amount_original"],
        currency_original=t["currency_original"],
        amount_base_eur=t["amount_base_eur"],
        exchange_rate=t["exchange_rate"],
        exchange_rate_source=t["exchange_rate_source"],
        transaction_date=t["transaction_date"],
        accounting_period=t["accounting_period"],
        description=t["description"],
        notes=t["notes"],
        transfer_to_account_id=t["transfer_to_account_id"],
        transfer_transaction_id=t["transfer_transaction_id"],
        created_at=t["created_at"],
        updated_at=t["updated_at"],
    )


@router.post("", response_model=Transaction, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    transaction: TransactionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new transaction."""
    # Verify account ownership
    account = (
        db.table("accounts")
        .select("id, currency_code")
        .eq("id", transaction.account_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not account.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Verify category exists
    category = (
        db.table("categories")
        .select("id, type")
        .eq("id", transaction.category_id)
        .execute()
    )
    if not category.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    # Validate allowance ownership if provided
    if transaction.allowance_id:
        allowance_check = (
            db.table("allowances")
            .select("id")
            .eq("id", transaction.allowance_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        if not allowance_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
            )

    # Validate annual budget ownership if provided
    if transaction.annual_budget_id:
        ab_check = (
            db.table("annual_budgets")
            .select("id")
            .eq("id", transaction.annual_budget_id)
            .eq("user_id", current_user.id)
            .execute()
        )
        if not ab_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
            )

    # Convert to EUR
    amount_eur, rate, source = await convert_amount(
        transaction.amount_original,
        transaction.currency_original,
        "EUR",
        transaction.transaction_date,
        db,
        transaction.exchange_rate,
    )

    # Determine accounting period
    accounting_period = transaction.accounting_period or get_accounting_period(
        transaction.transaction_date
    )

    data = {
        "user_id": current_user.id,
        "account_id": transaction.account_id,
        "category_id": transaction.category_id,
        "amount_original": transaction.amount_original,
        "currency_original": transaction.currency_original,
        "amount_base_eur": amount_eur,
        "exchange_rate": rate,
        "exchange_rate_source": source,
        "transaction_date": transaction.transaction_date.isoformat(),
        "accounting_period": accounting_period,
        "description": transaction.description,
        "notes": transaction.notes,
        "allowance_id": transaction.allowance_id,
        "annual_budget_id": transaction.annual_budget_id,
    }

    result = db.table("transactions").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create transaction",
        )

    return await get_transaction(result.data[0]["id"], current_user, db)


@router.patch("/{transaction_id}", response_model=Transaction)
async def update_transaction(
    transaction_id: str,
    transaction: TransactionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update a transaction."""
    # Verify ownership
    existing = (
        db.table("transactions")
        .select("*")
        .eq("id", transaction_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    update_data = transaction.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    # Validate allowance ownership if being changed
    if "allowance_id" in update_data and update_data["allowance_id"] is not None:
        allowance_check = (
            db.table("allowances")
            .select("id")
            .eq("id", update_data["allowance_id"])
            .eq("user_id", current_user.id)
            .execute()
        )
        if not allowance_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
            )

    # Validate annual budget ownership if being changed
    if "annual_budget_id" in update_data and update_data["annual_budget_id"] is not None:
        ab_check = (
            db.table("annual_budgets")
            .select("id")
            .eq("id", update_data["annual_budget_id"])
            .eq("user_id", current_user.id)
            .execute()
        )
        if not ab_check.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
            )

    # If amount or date changed, recalculate EUR conversion
    if "amount_original" in update_data or "exchange_rate" in update_data:
        amount = update_data.get("amount_original", existing.data[0]["amount_original"])
        currency = existing.data[0]["currency_original"]
        trans_date = update_data.get(
            "transaction_date", existing.data[0]["transaction_date"]
        )
        if isinstance(trans_date, str):
            trans_date = date.fromisoformat(trans_date)

        amount_eur, rate, source = await convert_amount(
            amount,
            currency,
            "EUR",
            trans_date,
            db,
            update_data.get("exchange_rate"),
        )
        update_data["amount_base_eur"] = amount_eur
        update_data["exchange_rate"] = rate
        update_data["exchange_rate_source"] = source

    if "transaction_date" in update_data and isinstance(
        update_data["transaction_date"], date
    ):
        update_data["transaction_date"] = update_data["transaction_date"].isoformat()

    result = (
        db.table("transactions").update(update_data).eq("id", transaction_id).execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update transaction",
        )

    return await get_transaction(transaction_id, current_user, db)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete a transaction."""
    # Verify ownership
    existing = (
        db.table("transactions")
        .select("id")
        .eq("id", transaction_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    db.table("transactions").delete().eq("id", transaction_id).execute()


@router.post(
    "/transfer", response_model=Transaction, status_code=status.HTTP_201_CREATED
)
async def create_transfer(
    transfer: TransferCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a transfer between accounts."""
    # Verify both accounts exist and belong to user
    from_account = (
        db.table("accounts")
        .select("*")
        .eq("id", transfer.from_account_id)
        .eq("user_id", current_user.id)
        .execute()
    )
    to_account = (
        db.table("accounts")
        .select("*")
        .eq("id", transfer.to_account_id)
        .eq("user_id", current_user.id)
        .execute()
    )

    if not from_account.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source account not found"
        )
    if not to_account.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination account not found",
        )

    # Get transfer category
    transfer_category = (
        db.table("categories")
        .select("id")
        .eq("name", "Transfer")
        .eq("type", "transfer")
        .execute()
    )
    if not transfer_category.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transfer category not found",
        )

    category_id = transfer_category.data[0]["id"]

    # Convert to EUR
    amount_eur, rate, source = await convert_amount(
        transfer.amount, transfer.currency, "EUR", transfer.transaction_date, db
    )

    accounting_period = get_accounting_period(transfer.transaction_date)

    # Create outgoing transaction (from account)
    outgoing_data = {
        "user_id": current_user.id,
        "account_id": transfer.from_account_id,
        "category_id": category_id,
        "amount_original": -abs(transfer.amount),
        "currency_original": transfer.currency,
        "amount_base_eur": -abs(amount_eur),
        "exchange_rate": rate,
        "exchange_rate_source": source,
        "transaction_date": transfer.transaction_date.isoformat(),
        "accounting_period": accounting_period,
        "description": transfer.description
        or f"Transfer to {to_account.data[0]['name']}",
        "transfer_to_account_id": transfer.to_account_id,
    }

    outgoing = db.table("transactions").insert(outgoing_data).execute()

    # Create incoming transaction (to account)
    # Convert amount to destination currency if different
    to_currency = to_account.data[0]["currency_code"]
    if to_currency != transfer.currency:
        to_amount, _, _ = await convert_amount(
            transfer.amount,
            transfer.currency,
            to_currency,
            transfer.transaction_date,
            db,
        )
    else:
        to_amount = transfer.amount

    incoming_data = {
        "user_id": current_user.id,
        "account_id": transfer.to_account_id,
        "category_id": category_id,
        "amount_original": abs(to_amount),
        "currency_original": to_currency,
        "amount_base_eur": abs(amount_eur),
        "exchange_rate": rate,
        "exchange_rate_source": source,
        "transaction_date": transfer.transaction_date.isoformat(),
        "accounting_period": accounting_period,
        "description": transfer.description
        or f"Transfer from {from_account.data[0]['name']}",
        "transfer_transaction_id": outgoing.data[0]["id"],
    }

    incoming = db.table("transactions").insert(incoming_data).execute()

    # Link the outgoing transaction to incoming
    db.table("transactions").update(
        {"transfer_transaction_id": incoming.data[0]["id"]}
    ).eq("id", outgoing.data[0]["id"]).execute()

    return await get_transaction(outgoing.data[0]["id"], current_user, db)
