"""Assign receipt items to categories with a small LLM behind an
OpenAI-compatible chat-completions endpoint (Gemini, OpenAI, ...)."""
import json
import logging
from typing import List, Optional, Sequence

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_PROMPT = (
    "You categorize line items from a Serbian shop receipt for a personal budget app. "
    "Item names are abbreviated Serbian/English product names.\n"
    "Shop: {merchant}\n\nCategories (index: name):\n{categories}\n\n"
    "Items (index: name):\n{items}\n\n"
    'Reply with JSON only: {{"categories": [<category index or null>, ...]}} '
    "with exactly one entry per item, in item order. Use null if unsure."
)


async def categorize_items(
    merchant: str, item_names: Sequence[str], category_names: Sequence[str]
) -> List[Optional[int]]:
    """Return a category index (into category_names) or None for every item.

    Never raises: categories are a convenience, the receipt import must work without.
    """
    none: List[Optional[int]] = [None] * len(item_names)
    settings = get_settings()
    if not settings.llm_api_key or not category_names or not item_names:
        return none

    prompt = _PROMPT.format(
        merchant=merchant,
        categories="\n".join(f"{i}: {name}" for i, name in enumerate(category_names)),
        items="\n".join(f"{i}: {name}" for i, name in enumerate(item_names)),
    )
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.llm_api_key}"},
                json={
                    "model": settings.llm_model,
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
            indexes = json.loads(content)["categories"]
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        logger.warning("Receipt categorization failed", exc_info=True)
        return none

    if not isinstance(indexes, list) or len(indexes) != len(item_names):
        return none
    return [
        i if isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(category_names) else None
        for i in indexes
    ]
