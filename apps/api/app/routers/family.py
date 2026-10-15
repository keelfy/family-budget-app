import secrets
from typing import List

from fastapi import APIRouter, Depends, status
from psycopg import AsyncConnection

from app.db import fetch_all, fetch_one
from app.dependencies import CurrentUser, get_current_user, get_db
from app.models import FamilyInvite, FamilyMember

router = APIRouter()

INVITE_VALID_DAYS = 7


@router.get("/members", response_model=List[FamilyMember])
async def list_members(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """List everyone in the family with their allowance."""
    rows = await fetch_all(
        db,
        "SELECT u.id, u.email, u.display_name, a.id AS allowance_id "
        "FROM users u LEFT JOIN allowances a ON a.user_id = u.id AND a.is_active "
        "WHERE u.family_id = %s ORDER BY u.created_at",
        [current_user.family_id],
    )
    return [FamilyMember(**r) for r in rows]


@router.post("/invites", response_model=FamilyInvite, status_code=status.HTTP_201_CREATED)
async def create_invite(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Create a single-use code for a new member to enter when registering."""
    row = await fetch_one(
        db,
        "INSERT INTO family_invites (code, family_id, created_by, expires_at) "
        "VALUES (%s, %s, %s, NOW() + make_interval(days => %s)) RETURNING code, expires_at",
        [secrets.token_urlsafe(9), current_user.family_id, current_user.id, INVITE_VALID_DAYS],
    )
    return FamilyInvite(**row)
