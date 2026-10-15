from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg import AsyncConnection

from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import (
    Transaction,
    TransactionCreate,
    TransactionItemIn,
    TransactionUpdate,
    TransferCreate,
)
from app.services.currency_service import convert_amount, save_exchange_rate

router = APIRouter()

_TRANSACTION_SELECT = """
    SELECT t.*,
           a.name AS account_name,
           c.name AS category_name,
           c.type AS category_type,
           al.name AS allowance_name,
           ab.name AS annual_budget_name,
           (SELECT COUNT(*) FROM transaction_items ti
            WHERE ti.transaction_id = t.id)::int AS items_count
    FROM transactions t
    JOIN accounts a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN allowances al ON al.id = t.allowance_id
    LEFT JOIN annual_budgets ab ON ab.id = t.annual_budget_id
"""


def get_accounting_period(transaction_date: date) -> str:
    """Get accounting period from date (YYYY-MM format)."""
    return transaction_date.strftime("%Y-%m")


def _items_total(items: List[TransactionItemIn]) -> float:
    return round(sum(item.amount for item in items), 2)


def _check_items_total(items: List[TransactionItemIn], amount: float) -> None:
    if abs(_items_total(items) - abs(amount)) > 0.005:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Sum of items must equal the transaction amount",
        )


def _reject_transfer_items(category_type: str) -> None:
    if category_type == "transfer":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transfers cannot have items",
        )


async def _check_item_categories(
    db: AsyncConnection,
    user_id: str,
    category_ids: List[Optional[str]],
    category_type: str,
) -> None:
    """Item categories must be visible to the user and share the transaction's type."""
    ids = sorted({cid for cid in category_ids if cid})
    if not ids:
        return
    rows = await fetch_all(
        db,
        "SELECT id, type FROM categories "
        "WHERE id = ANY(%s::uuid[]) AND (user_id IS NULL OR user_id = %s)",
        [ids, user_id],
    )
    if len(rows) != len(ids):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )
    if any(row["type"] != category_type for row in rows):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item category must have the same type as the transaction category",
        )


async def _replace_items(
    db: AsyncConnection, transaction_id: str, items: List[TransactionItemIn]
) -> None:
    await execute(
        db, "DELETE FROM transaction_items WHERE transaction_id = %s", [transaction_id]
    )
    for position, item in enumerate(items):
        await insert(
            db,
            "transaction_items",
            {
                "transaction_id": transaction_id,
                "name": item.name,
                "amount": item.amount,
                "category_id": item.category_id,
                "position": position,
            },
        )


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
    db: AsyncConnection = Depends(get_db),
):
    """List transactions with optional filters."""
    conditions = ["t.user_id = %s"]
    params: list = [current_user.id]

    for column, value in (
        ("accounting_period", period),
        ("account_id", account_id),
        ("category_id", category_id),
        ("allowance_id", allowance_id),
        ("annual_budget_id", annual_budget_id),
    ):
        if value:
            conditions.append(f"t.{column} = %s")
            params.append(value)

    rows = await fetch_all(
        db,
        f"{_TRANSACTION_SELECT} WHERE {' AND '.join(conditions)} "
        "ORDER BY t.transaction_date DESC, t.created_at DESC LIMIT %s OFFSET %s",
        [*params, limit, offset],
    )

    return [Transaction(**t) for t in rows]


@router.get("/{transaction_id}", response_model=Transaction)
async def get_transaction(
    transaction_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a specific transaction."""
    row = await fetch_one(
        db,
        f"{_TRANSACTION_SELECT} WHERE t.id = %s AND t.user_id = %s",
        [transaction_id, current_user.id],
    )

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    items = []
    if row["items_count"]:
        items = await fetch_all(
            db,
            "SELECT ti.id, ti.name, ti.amount, ti.position, ti.category_id, "
            "c.name AS category_name "
            "FROM transaction_items ti "
            "LEFT JOIN categories c ON c.id = ti.category_id "
            "WHERE ti.transaction_id = %s ORDER BY ti.position",
            [transaction_id],
        )

    return Transaction(**{**row, "items": items})


@router.post("", response_model=Transaction, status_code=status.HTTP_201_CREATED)
async def create_transaction(
    transaction: TransactionCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new transaction."""
    # Verify account ownership
    account = await fetch_one(
        db,
        "SELECT id, currency_code FROM accounts WHERE id = %s AND user_id = %s",
        [transaction.account_id, current_user.id],
    )
    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Account not found"
        )

    # Verify category is visible to the user
    category = await fetch_one(
        db,
        "SELECT id, type FROM categories WHERE id = %s AND (user_id IS NULL OR user_id = %s)",
        [transaction.category_id, current_user.id],
    )
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
        )

    # Validate allowance ownership if provided
    if transaction.allowance_id:
        allowance_check = await fetch_one(
            db,
            "SELECT id FROM allowances WHERE id = %s AND user_id = %s",
            [transaction.allowance_id, current_user.id],
        )
        if not allowance_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
            )

    # Validate annual budget ownership if provided
    if transaction.annual_budget_id:
        ab_check = await fetch_one(
            db,
            "SELECT id FROM annual_budgets WHERE id = %s AND user_id = %s",
            [transaction.annual_budget_id, current_user.id],
        )
        if not ab_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
            )

    if transaction.items:
        _reject_transfer_items(category["type"])
        _check_items_total(transaction.items, transaction.amount_original)
        await _check_item_categories(
            db,
            current_user.id,
            [item.category_id for item in transaction.items],
            category["type"],
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

    async with db.transaction():
        created = await insert(
            db,
            "transactions",
            {
                "user_id": current_user.id,
                "account_id": transaction.account_id,
                "category_id": transaction.category_id,
                "amount_original": transaction.amount_original,
                "currency_original": transaction.currency_original,
                "amount_base_eur": amount_eur,
                "exchange_rate": rate,
                "exchange_rate_source": source,
                "transaction_date": transaction.transaction_date,
                "accounting_period": accounting_period,
                "description": transaction.description,
                "notes": transaction.notes,
                "allowance_id": transaction.allowance_id,
                "annual_budget_id": transaction.annual_budget_id,
            },
        )
        if transaction.items:
            await _replace_items(db, created["id"], transaction.items)

    return await get_transaction(created["id"], current_user, db)


@router.patch("/{transaction_id}", response_model=Transaction)
async def update_transaction(
    transaction_id: str,
    transaction: TransactionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a transaction."""
    # Verify ownership
    existing = await fetch_one(
        db,
        "SELECT * FROM transactions WHERE id = %s AND user_id = %s",
        [transaction_id, current_user.id],
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    update_data = transaction.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )

    # Validate allowance ownership if being changed
    if update_data.get("allowance_id") is not None:
        allowance_check = await fetch_one(
            db,
            "SELECT id FROM allowances WHERE id = %s AND user_id = %s",
            [update_data["allowance_id"], current_user.id],
        )
        if not allowance_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Allowance not found"
            )

    # Validate annual budget ownership if being changed
    if update_data.get("annual_budget_id") is not None:
        ab_check = await fetch_one(
            db,
            "SELECT id FROM annual_budgets WHERE id = %s AND user_id = %s",
            [update_data["annual_budget_id"], current_user.id],
        )
        if not ab_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Annual budget not found"
            )

    # Receipt lines: they define the amount, so the two must stay in sync.
    items = update_data.pop("items", None)
    if items is not None:
        items = [TransactionItemIn(**item) for item in items]
    existing_items = await fetch_one(
        db,
        "SELECT 1 FROM transaction_items WHERE transaction_id = %s LIMIT 1",
        [transaction_id],
    )
    will_have_items = bool(items) if items is not None else bool(existing_items)
    if will_have_items:
        category = await fetch_one(
            db,
            "SELECT type FROM categories WHERE id = %s",
            [update_data.get("category_id", existing["category_id"])],
        )
        category_type = category["type"] if category else ""
        _reject_transfer_items(category_type)
        if items is not None:
            item_category_ids = [item.category_id for item in items]
        else:
            # Kept items must still match the (possibly changed) transaction category.
            item_category_ids = [
                row["category_id"]
                for row in await fetch_all(
                    db,
                    "SELECT category_id FROM transaction_items "
                    "WHERE transaction_id = %s AND category_id IS NOT NULL",
                    [transaction_id],
                )
            ]
        await _check_item_categories(
            db, current_user.id, item_category_ids, category_type
        )
    if items:
        if "amount_original" in update_data:
            _check_items_total(items, update_data["amount_original"])
        update_data["amount_original"] = _items_total(items)
    elif items is None and existing_items and "amount_original" in update_data:
        if abs(abs(update_data["amount_original"]) - abs(existing["amount_original"])) > 0.005:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Amount is defined by items; send the updated items list",
            )

    # If amount or rate changed, recalculate EUR conversion
    if "amount_original" in update_data or "exchange_rate" in update_data:
        amount = update_data.get("amount_original", existing["amount_original"])
        currency = existing["currency_original"]
        trans_date = update_data.get("transaction_date", existing["transaction_date"])

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

    async with db.transaction():
        if update_data:
            await update(db, "transactions", update_data, {"id": transaction_id})
        if items is not None:
            await _replace_items(db, transaction_id, items)

    return await get_transaction(transaction_id, current_user, db)


@router.delete("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction(
    transaction_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a transaction."""
    existing = await fetch_one(
        db,
        "SELECT id FROM transactions WHERE id = %s AND user_id = %s",
        [transaction_id, current_user.id],
    )
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found"
        )

    await execute(db, "DELETE FROM transactions WHERE id = %s", [transaction_id])


@router.post(
    "/transfer", response_model=Transaction, status_code=status.HTTP_201_CREATED
)
async def create_transfer(
    transfer: TransferCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a transfer between accounts."""
    # Verify both accounts exist and belong to user
    from_account = await fetch_one(
        db,
        "SELECT * FROM accounts WHERE id = %s AND user_id = %s",
        [transfer.from_account_id, current_user.id],
    )
    to_account = await fetch_one(
        db,
        "SELECT * FROM accounts WHERE id = %s AND user_id = %s",
        [transfer.to_account_id, current_user.id],
    )

    if not from_account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Source account not found"
        )
    if not to_account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination account not found",
        )

    # Get transfer category
    transfer_category = await fetch_one(
        db,
        "SELECT id FROM categories WHERE name = 'Transfer' AND type = 'transfer' "
        "AND user_id IS NULL LIMIT 1",
    )
    if not transfer_category:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Transfer category not found",
        )

    category_id = transfer_category["id"]

    accounting_period = get_accounting_period(transfer.transaction_date)
    to_currency = to_account["currency_code"]

    if transfer.to_amount is not None and (
        to_currency == transfer.currency or transfer.amount == 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="to_amount requires a non-zero cross-currency transfer",
        )

    async with db.transaction():
        if transfer.to_amount is not None:
            # Real exchange: the actual amounts define the user's own rate,
            # which then applies to later transactions in this currency pair.
            await save_exchange_rate(
                db,
                transfer.currency,
                to_currency,
                transfer.to_amount / abs(transfer.amount),
                transfer.transaction_date,
                "manual",
            )
            to_amount = transfer.to_amount
        elif to_currency != transfer.currency:
            to_amount, _, _ = await convert_amount(
                transfer.amount,
                transfer.currency,
                to_currency,
                transfer.transaction_date,
                db,
            )
        else:
            to_amount = transfer.amount

        # Convert to EUR (picks up the rate saved above)
        amount_eur, rate, source = await convert_amount(
            transfer.amount, transfer.currency, "EUR", transfer.transaction_date, db
        )

        # Outgoing transaction (from account)
        outgoing = await insert(
            db,
            "transactions",
            {
                "user_id": current_user.id,
                "account_id": transfer.from_account_id,
                "category_id": category_id,
                "amount_original": -abs(transfer.amount),
                "currency_original": transfer.currency,
                "amount_base_eur": -abs(amount_eur),
                "exchange_rate": rate,
                "exchange_rate_source": source,
                "transaction_date": transfer.transaction_date,
                "accounting_period": accounting_period,
                "description": transfer.description
                or f"Transfer to {to_account['name']}",
                "transfer_to_account_id": transfer.to_account_id,
            },
        )

        # Incoming transaction (to account)
        incoming = await insert(
            db,
            "transactions",
            {
                "user_id": current_user.id,
                "account_id": transfer.to_account_id,
                "category_id": category_id,
                "amount_original": abs(to_amount),
                "currency_original": to_currency,
                "amount_base_eur": abs(amount_eur),
                "exchange_rate": rate,
                "exchange_rate_source": source,
                "transaction_date": transfer.transaction_date,
                "accounting_period": accounting_period,
                "description": transfer.description
                or f"Transfer from {from_account['name']}",
                "transfer_transaction_id": outgoing["id"],
            },
        )

        # Link the outgoing transaction to incoming
        await update(
            db,
            "transactions",
            {"transfer_transaction_id": incoming["id"]},
            {"id": outgoing["id"]},
        )

    return await get_transaction(outgoing["id"], current_user, db)
