from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from supabase import Client
from app.dependencies import get_current_user, get_db, CurrentUser
from app.models import Category, CategoryCreate, CategoryUpdate

router = APIRouter()


@router.get("", response_model=List[Category])
async def list_categories(
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """List all categories (system + user's custom)."""
    # Get system categories and user's categories
    result = db.table("categories").select("*").or_(
        f"user_id.is.null,user_id.eq.{current_user.id}"
    ).order("type").order("sort_order").execute()

    return [Category(**cat) for cat in result.data]


@router.get("/{category_id}", response_model=Category)
async def get_category(
    category_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Get a specific category."""
    result = db.table("categories").select("*").eq("id", category_id).or_(
        f"user_id.is.null,user_id.eq.{current_user.id}"
    ).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    return Category(**result.data[0])


@router.post("", response_model=Category, status_code=status.HTTP_201_CREATED)
async def create_category(
    category: CategoryCreate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Create a new category."""
    data = {
        "user_id": current_user.id,
        "name": category.name,
        "type": category.type,
        "parent_id": category.parent_id,
        "icon": category.icon,
        "color": category.color,
        "is_allowance": category.is_allowance,
        "is_system": False,
    }

    result = db.table("categories").insert(data).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create category")

    return Category(**result.data[0])


@router.patch("/{category_id}", response_model=Category)
async def update_category(
    category_id: str,
    category: CategoryUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Update a category (only user's custom categories)."""
    # Verify ownership and not system category
    existing = db.table("categories").select("*").eq("id", category_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or cannot be modified")

    if existing.data[0].get("is_system"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify system categories")

    update_data = category.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update")

    result = db.table("categories").update(update_data).eq("id", category_id).execute()

    if not result.data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update category")

    return Category(**result.data[0])


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: Client = Depends(get_db),
):
    """Delete a category (only user's custom categories)."""
    # Verify ownership and not system category
    existing = db.table("categories").select("*").eq("id", category_id).eq("user_id", current_user.id).execute()
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found or cannot be deleted")

    if existing.data[0].get("is_system"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete system categories")

    # Check for transactions
    transactions = db.table("transactions").select("id").eq("category_id", category_id).limit(1).execute()
    if transactions.data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category with transactions",
        )

    db.table("categories").delete().eq("id", category_id).execute()
