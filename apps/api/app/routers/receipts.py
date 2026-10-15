from collections import defaultdict

from fastapi import APIRouter, Depends
from psycopg import AsyncConnection

from app.db import fetch_all
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import ReceiptItem, ReceiptParseRequest, ReceiptPreview
from app.services.categorizer import categorize_items
from app.services.receipt_service import fetch_receipt

router = APIRouter()


@router.post("/parse", response_model=ReceiptPreview)
async def parse_receipt(
    body: ReceiptParseRequest,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Read a Serbian fiscal receipt from its QR code URL and suggest categories.

    Nothing is saved: the client reviews the preview and creates the transaction.
    """
    receipt = await fetch_receipt(body.url)

    categories = await fetch_all(
        db,
        "SELECT id, name FROM categories "
        "WHERE type = 'expense' AND (user_id IS NULL OR user_id = %s) "
        "ORDER BY sort_order, name",
        [current_user.id],
    )
    picks = await categorize_items(
        receipt.merchant,
        [item.name for item in receipt.items],
        [c["name"] for c in categories],
    )

    items = [
        ReceiptItem(
            name=item.name,
            amount=item.amount,
            category_id=categories[pick]["id"] if pick is not None else None,
        )
        for item, pick in zip(receipt.items, picks)
    ]

    spent: dict = defaultdict(float)
    for item in items:
        if item.category_id:
            spent[item.category_id] += item.amount
    top_category = max(spent, key=spent.get) if spent else None

    return ReceiptPreview(
        invoice_number=receipt.invoice_number,
        merchant=receipt.merchant,
        address=receipt.address,
        transaction_date=receipt.transaction_date,
        currency=receipt.currency,
        total=receipt.total,
        items=items,
        category_id=top_category,
    )
