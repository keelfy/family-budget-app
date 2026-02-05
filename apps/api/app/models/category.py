from pydantic import BaseModel
from typing import Optional, List, Literal
from datetime import datetime


CategoryType = Literal["income", "expense", "transfer"]


class CategoryBase(BaseModel):
    name: str
    type: CategoryType
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_allowance: bool = False


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_allowance: Optional[bool] = None


class Category(CategoryBase):
    id: str
    user_id: Optional[str]
    is_system: bool
    sort_order: int
    created_at: datetime
    updated_at: datetime
    children: Optional[List["Category"]] = None

    class Config:
        from_attributes = True


# Update forward reference
Category.model_rebuild()
