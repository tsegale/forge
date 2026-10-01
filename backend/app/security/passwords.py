"""Password hashing with Argon2id.

argon2-cffi's defaults follow the RFC 9106 low-memory profile (t=3, m=64 MiB, p=4). Hashes are
self-describing, so raising the parameters later is safe: ``needs_rehash`` flags old hashes and
the login flow re-hashes them transparently.
"""

from __future__ import annotations

from functools import cache

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


@cache
def _dummy_hash() -> str:
    return _hasher.hash("forge-timing-equaliser")


def burn_verification(password: str) -> None:
    """Spend the same time as a real verification when the account does not exist,
    so response timing does not reveal which email addresses are registered."""
    verify_password(_dummy_hash(), password)
