from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg import AsyncConnection

from app.db import fetch_one, get_db
from app.security import check_password

# auto_error=False + no WWW-Authenticate header: browsers must not show their native login prompt.
security = HTTPBasic(auto_error=False)


class CurrentUser:
    def __init__(
        self, id: str, email: str, role: str = "user", display_name: str | None = None
    ):
        self.id = id
        self.email = email
        self.role = role
        self.display_name = display_name


async def get_current_user(
    credentials: HTTPBasicCredentials | None = Depends(security),
    db: AsyncConnection = Depends(get_db),
) -> CurrentUser:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
    )
    if credentials is None:
        raise unauthorized

    user = await fetch_one(
        db,
        "SELECT id, email, password_hash, role, display_name FROM users WHERE email = %s",
        [credentials.username.strip().lower()],
    )
    password_hash = user["password_hash"] if user else None
    if not await check_password(credentials.password, password_hash) or user is None:
        raise unauthorized

    return CurrentUser(
        id=user["id"],
        email=user["email"],
        role=user["role"],
        display_name=user["display_name"],
    )
