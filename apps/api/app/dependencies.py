import httpx
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwk, jwt

from app.config import get_settings
from app.db.supabase import get_supabase_client
from supabase import Client

security = HTTPBearer()


class CurrentUser:
    def __init__(self, id: str, email: str, role: str = "user"):
        self.id = id
        self.email = email
        self.role = role


# You can cache this globally so you don't fetch it on every request
_jwks_cache = None


def get_jwks():
    global _jwks_cache
    settings = get_settings()
    JWKS_URL = f"{settings.supabase_url}/auth/v1/.well-known/jwks.json"
    if _jwks_cache is None:
        with httpx.Client() as client:
            response = client.get(JWKS_URL)
            response.raise_for_status()
            _jwks_cache = response.json()
    return _jwks_cache


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    token = credentials.credentials

    try:
        # 1. Get the 'kid' (Key ID) from the token header
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")

        # 2. Find the matching key in the JWKS
        jwks = get_jwks()
        key_data = next((k for k in jwks["keys"] if k["kid"] == kid), None)

        if not key_data:
            raise HTTPException(status_code=401, detail="Public key not found")

        # 3. Construct the public key object
        public_key = jwk.construct(key_data)

        # 4. Decode and verify
        payload = jwt.decode(
            token,
            public_key,  # Use the constructed public key object
            algorithms=["ES256"],
            audience="authenticated",
        )

        return CurrentUser(
            id=payload.get("sub") or "",
            email=payload.get("email") or "",
            role=payload.get("role") or "",
        )

    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Auth error: {str(e)}")


async def get_db() -> Client:
    """Get Supabase client with service role for database operations."""
    return get_supabase_client()
