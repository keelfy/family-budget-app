import asyncio

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg import AsyncConnection
from psycopg.errors import UniqueViolation

from app.db import execute, fetch_one, get_db, insert
from app.dependencies import CurrentUser, get_current_user
from app.models import PasswordChange, User, UserRegister
from app.security import check_password, hash_password

router = APIRouter()


@router.post("/register", response_model=User, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegister, db: AsyncConnection = Depends(get_db)):
    """Create an account. Authenticate afterwards with HTTP Basic (email + password)."""
    password_hash = await asyncio.to_thread(hash_password, data.password)
    try:
        row = await insert(
            db,
            "users",
            {
                "email": data.email.lower(),
                "password_hash": password_hash,
                "display_name": data.display_name,
            },
        )
    except UniqueViolation:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )
    return User(**row)


@router.get("/me", response_model=User)
async def me(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    """Return the authenticated user (also used to validate credentials on login)."""
    row = await fetch_one(
        db,
        "SELECT id, email, display_name, role, created_at FROM users WHERE id = %s",
        [current_user.id],
    )
    return User(**row)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    data: PasswordChange,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncConnection = Depends(get_db),
):
    row = await fetch_one(
        db, "SELECT password_hash FROM users WHERE id = %s", [current_user.id]
    )
    if not await check_password(data.current_password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    new_hash = await asyncio.to_thread(hash_password, data.new_password)
    await execute(
        db,
        "UPDATE users SET password_hash = %s, updated_at = NOW() WHERE id = %s",
        [new_hash, current_user.id],
    )
