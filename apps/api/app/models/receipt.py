from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class ReceiptParseRequest(BaseModel):
    # Content of the QR code on a Serbian fiscal receipt.
    url: str = Field(..., max_length=4000)


class ReceiptItem(BaseModel):
    name: str
    amount: float
    category_id: Optional[str] = None


class ReceiptPreview(BaseModel):
    invoice_number: str
    merchant: str
    address: Optional[str] = None
    transaction_date: date
    currency: str = "RSD"
    total: float
    items: List[ReceiptItem]
    # Most spent-on item category; None when items could not be categorized.
    category_id: Optional[str] = None
