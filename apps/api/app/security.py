import asyncio
import base64
import hashlib

import bcrypt


def _prehash(password: str) -> bytes:
    # bcrypt only reads the first 72 bytes; hash first so long passwords keep full entropy.
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(_prehash(password), password_hash.encode())
    except ValueError:
        return False


# HTTP Basic sends the password on every request; bcrypt is deliberately slow.
# Remember successful checks (keyed by hash + password, so a password change
# invalidates them) to keep per-request cost low.
_verified: set[str] = set()
_MAX_VERIFIED = 1024
_DUMMY_HASH = hash_password("timing-equalizer")


async def check_password(password: str, password_hash: str | None) -> bool:
    """Verify password off the event loop. `None` hash burns equal time (unknown user)."""
    if password_hash is None:
        await asyncio.to_thread(verify_password, password, _DUMMY_HASH)
        return False

    key = hashlib.sha256(f"{password_hash}\0{password}".encode()).hexdigest()
    if key in _verified:
        return True

    if not await asyncio.to_thread(verify_password, password, password_hash):
        return False

    if len(_verified) >= _MAX_VERIFIED:
        _verified.clear()
    _verified.add(key)
    return True
