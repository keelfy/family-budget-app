from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from psycopg import AsyncConnection
from app.db import execute, fetch_all, fetch_one, insert, update
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Category, CategoryCreate, CategoryUpdate

router = APIRouter()


@router.get("", response_model=List[Category])
async def list_categories(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List all categories (system + user's custom)."""
    rows = await fetch_all(
        db,
        "SELECT * FROM categories WHERE user_id IS NULL OR user_id = %s ORDER BY type, sort_order",
        [current_user.id],
    )

    return [Category(**cat) for cat in rows]


@router.get("/{category_id}", response_model=Category)
async def get_category(
    category_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Get a specific category."""
    row = await fetch_one(
        db,
        "SELECT * FROM categories WHERE id = %s AND (user_id IS NULL OR user_id = %s)",
        [category_id, current_user.id],
    )

    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    return Category(**row)


@router.post("", response_model=Category, status_code=status.HTTP_201_CREATED)
async def create_category(
    category: CategoryCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a new category."""
    row = await insert(
        db,
        "categories",
        {
            "user_id": current_user.id,
            "name": category.name,
            "type": category.type,
            "parent_id": category.parent_id,
            "icon": category.icon,
            "color": category.color,
            "is_allowance": category.is_allowance,
            "is_system": False,
        },
    )

    return Category(**row)


@router.patch("/{category_id}", response_model=Category)
async def update_category(
    category_id: str,
    category: CategoryUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Update a category (only user's custom categories)."""
    existing = await fetch_one(
        db,
        "SELECT is_system FROM categories WHERE id = %s AND user_id = %s",
        [category_id, current_user.id],
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or cannot be modified")

    if existing["is_system"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify system categories")

    update_data = category.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    row = await update(db, "categories", update_data, {"id": category_id})

    return Category(**row)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Delete a category (only user's custom categories)."""
    existing = await fetch_one(
        db,
        "SELECT is_system FROM categories WHERE id = %s AND user_id = %s",
        [category_id, current_user.id],
    )
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or cannot be deleted")

    if existing["is_system"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete system categories")

    has_transactions = await fetch_one(
        db, "SELECT 1 FROM transactions WHERE category_id = %s LIMIT 1", [category_id]
    )
    if has_transactions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category with transactions",
        )

    await execute(db, "DELETE FROM categories WHERE id = %s", [category_id])
