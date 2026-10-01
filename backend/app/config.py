"""Environment-driven configuration. Nothing secret is hardcoded."""

import os
from datetime import timedelta

# HS256 keys must be at least as long as the hash output (RFC 7518, section 3.2).
MIN_JWT_KEY_BYTES = 32


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _jwt_key() -> str:
    key = _require("JWT_SECRET_KEY")
    if len(key.encode()) < MIN_JWT_KEY_BYTES:
        raise RuntimeError(f"JWT_SECRET_KEY must be at least {MIN_JWT_KEY_BYTES} bytes")
    return key


class BaseConfig:
    DEBUG = False
    TESTING = False
    SQLALCHEMY_RECORD_QUERIES = False
    JSON_SORT_KEYS = False

    JWT_ALGORITHM = "HS256"
    JWT_ISSUER = "forge-api"
    JWT_AUDIENCE = "forge"
    ACCESS_TOKEN_TTL = timedelta(minutes=15)
    REFRESH_TOKEN_TTL = timedelta(days=14)
    # Absolute lifetime of a login: rotation cannot extend a token family past this.
    REFRESH_FAMILY_TTL = timedelta(days=30)
    REFRESH_COOKIE_NAME = "forge_refresh"
    REFRESH_COOKIE_PATH = "/api/v1/auth"
    REFRESH_COOKIE_SECURE = True

    def __init__(self) -> None:
        self.SECRET_KEY = _require("SECRET_KEY")
        self.JWT_SECRET_KEY = _jwt_key()
        self.SQLALCHEMY_DATABASE_URI = _require("DATABASE_URL")
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}
        self.REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        self.STORE_CURRENCY = os.environ.get("STORE_CURRENCY", "nad")


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_RECORD_QUERIES = True
    REFRESH_COOKIE_SECURE = False  # plain http on the developer's machine


class ProductionConfig(BaseConfig):
    pass


class TestingConfig(BaseConfig):
    TESTING = True

    def __init__(self) -> None:
        os.environ.setdefault("SECRET_KEY", "test-secret-not-for-production")
        os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-not-for-production-0123456789")
        os.environ.setdefault("DATABASE_URL", _require("TEST_DATABASE_URL"))
        super().__init__()
        self.SQLALCHEMY_DATABASE_URI = _require("TEST_DATABASE_URL")
        # Separate Redis database so test runs never touch development rate-limit or cache keys.
        self.REDIS_URL = _require("TEST_REDIS_URL")
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}


CONFIGS = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
