"""Fetch and parse Serbian fiscal receipts (SUF / TaxCore) from their QR URL."""
import html
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException, status

SUF_HOST = "suf.purs.gov.rs"
_TIMEOUT = 15.0

_INVOICE_RE = re.compile(r"InvoiceNumber\('([^']+)'\)")
_TOKEN_RE = re.compile(r"Token\('([^']+)'\)")


@dataclass
class ParsedItem:
    name: str
    amount: float


@dataclass
class ParsedReceipt:
    invoice_number: str
    merchant: str
    address: Optional[str]
    transaction_date: date
    total: float
    items: List[ParsedItem]
    currency: str = "RSD"


def _bad_receipt(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=detail)


def _label(page: str, element_id: str) -> Optional[str]:
    match = re.search(rf'id="{element_id}"[^>]*>(.*?)</', page, re.S)
    if not match:
        return None
    return " ".join(html.unescape(match.group(1)).split()) or None


def _parse_amount(text: str) -> float:
    # Serbian format: "1.234,56"
    return float(text.replace(".", "").replace(",", "."))


def _item_name(raw: dict) -> str:
    name = " ".join(str(raw.get("name", "")).split())[:180] or "Item"
    quantity = raw.get("quantity") or 1
    return name if quantity == 1 else f"{name} × {quantity:g}"


def _items(raw_items: List[dict]) -> List[ParsedItem]:
    items: List[ParsedItem] = []
    for raw in raw_items:
        total = round(float(raw.get("total") or 0), 2)
        if total > 0:
            items.append(ParsedItem(_item_name(raw), total))
        elif items:
            # Discount line: take it off the item it follows.
            items[-1].amount = round(items[-1].amount + total, 2)
    return [item for item in items if item.amount > 0]


def validate_receipt_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme != "https" or parsed.hostname != SUF_HOST or not parsed.query:
        raise _bad_receipt("Not a Serbian fiscal receipt QR code")
    return parsed.geturl()


async def fetch_receipt(url: str) -> ParsedReceipt:
    url = validate_receipt_url(url)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            page_response = await client.get(url)
            page_response.raise_for_status()
            page = page_response.text

            invoice = _INVOICE_RE.search(page)
            token = _TOKEN_RE.search(page)
            if not invoice or not token:
                raise _bad_receipt("Receipt not found")

            spec_response = await client.post(
                f"https://{SUF_HOST}/specifications",
                data={"invoiceNumber": invoice.group(1), "token": token.group(1)},
            )
            spec_response.raise_for_status()
            spec = spec_response.json()
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not reach the tax authority",
        )

    items = _items(spec.get("items") or []) if spec.get("success") else []
    if not items:
        raise _bad_receipt("Receipt has no items")

    merchant = _label(page, "shopFullNameLabel")
    date_text = _label(page, "sdcDateTimeLabel")
    total_text = _label(page, "totalAmountLabel")
    if not (merchant and date_text and total_text):
        raise _bad_receipt("Could not read the receipt")
    try:
        issued = datetime.strptime(date_text.split(" ")[0], "%d.%m.%Y.").date()
        total = _parse_amount(total_text)
    except ValueError:
        raise _bad_receipt("Could not read the receipt")

    return ParsedReceipt(
        invoice_number=invoice.group(1),
        # "1316581-WOLT" -> "WOLT": the leading number is the shop's register id.
        merchant=re.sub(r"^\d+\s*-\s*", "", merchant),
        address=_label(page, "addressLabel"),
        transaction_date=issued,
        total=total,
        items=items,
    )
