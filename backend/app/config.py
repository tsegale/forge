"""Environment-driven configuration. Nothing secret is hardcoded."""

import os


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


class BaseConfig:
    DEBUG = False
    TESTING = False
    SQLALCHEMY_RECORD_QUERIES = False
    JSON_SORT_KEYS = False

    def __init__(self) -> None:
        self.SECRET_KEY = _require("SECRET_KEY")
        self.SQLALCHEMY_DATABASE_URI = _require("DATABASE_URL")
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}
        self.REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        self.STORE_CURRENCY = os.environ.get("STORE_CURRENCY", "nad")


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_RECORD_QUERIES = True


class ProductionConfig(BaseConfig):
    pass


class TestingConfig(BaseConfig):
    TESTING = True

    def __init__(self) -> None:
        os.environ.setdefault("SECRET_KEY", "test-secret-not-for-production")
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
