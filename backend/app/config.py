"""Environment-driven configuration. Nothing secret is hardcoded."""

import os
from datetime import timedelta
from pathlib import Path

from celery.schedules import crontab

TEST_WEBHOOK_SECRET = "whsec_forge_test_signing_secret"

# HS256 keys must be at least as long as the hash output (RFC 7518, section 3.2).
MIN_JWT_KEY_BYTES = 32


def _require(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def _payment_settings(production: bool) -> dict[str, str]:
    """Stripe keys come only from the environment. Without a secret key outside production the
    in-process fake gateway is used; a live key is refused anywhere but production."""
    secret = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    gateway = os.environ.get("PAYMENT_GATEWAY", "stripe" if (secret or production) else "fake")
    if gateway not in ("stripe", "fake"):
        raise RuntimeError("PAYMENT_GATEWAY must be 'stripe' or 'fake'")
    if gateway == "fake" and production:
        raise RuntimeError("The fake payment gateway cannot be used in production")
    if gateway == "stripe":
        secret = _require("STRIPE_SECRET_KEY").strip()
        if not secret.startswith(("sk_test_", "sk_live_", "rk_test_", "rk_live_")):
            raise RuntimeError("STRIPE_SECRET_KEY is not a Stripe secret key")
        if "_live_" in secret and not production:
            raise RuntimeError("Refusing a live Stripe key outside production")
        webhook_secret = _require("STRIPE_WEBHOOK_SECRET").strip()
    else:
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "whsec_local_fake_gateway").strip()
    # The publishable key is public by design (Stripe.js uses it in the browser).
    publishable = os.environ.get("STRIPE_PUBLISHABLE_KEY", "").strip()
    if publishable and not publishable.startswith(("pk_test_", "pk_live_")):
        raise RuntimeError("STRIPE_PUBLISHABLE_KEY is not a Stripe publishable key")
    if "_live_" in publishable and not production:
        raise RuntimeError("Refusing a live Stripe key outside production")
    if gateway == "stripe" and production and not publishable:
        raise RuntimeError("Missing required environment variable: STRIPE_PUBLISHABLE_KEY")
    return {
        "PAYMENT_GATEWAY": gateway,
        "STRIPE_SECRET_KEY": secret,
        "STRIPE_WEBHOOK_SECRET": webhook_secret,
        "STRIPE_PUBLISHABLE_KEY": publishable,
    }


# Periodic jobs for Celery beat, by task name (defined in app/tasks.py).
BEAT_SCHEDULE: dict[str, dict] = {
    "sweep-expired-reservations": {"task": "forge.sweep_expired_reservations", "schedule": 60.0},
    # A safety net: price changes made through the admin API also check their product's alerts at once.
    "check-price-alerts": {"task": "forge.check_price_alerts", "schedule": 900.0},
    # On the 25th, so next month's partition exists days before the month begins.
    "price-history-partitions": {
        "task": "forge.maintain_price_history_partitions",
        "schedule": crontab(minute=0, hour=3, day_of_month=25),
    },
}


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
    # A readable companion to the HttpOnly refresh cookie: it holds no secret, only "a session may
    # exist", so the browser app skips the refresh call (and its 401) for visitors who never signed in.
    SESSION_HINT_COOKIE_NAME = "forge_session"
    CART_COOKIE_NAME = "forge_cart"
    CART_COOKIE_PATH = "/api/v1"
    CART_COOKIE_MAX_AGE = timedelta(days=30)
    CART_COOKIE_SECURE = True

    RATELIMIT_STRATEGY = "moving-window"
    RATELIMIT_HEADERS_ENABLED = True
    RATELIMIT_KEY_PREFIX = "forge:ratelimit"
    # If Redis is unreachable, keep limiting with per-process counters instead of failing open.
    RATELIMIT_SWALLOW_ERRORS = True
    RATELIMIT_IN_MEMORY_FALLBACK_ENABLED = True
    # Bound every Redis call: a hung Redis must degrade to the fallback, not hang logins.
    RATELIMIT_STORAGE_OPTIONS = {"socket_connect_timeout": 0.5, "socket_timeout": 0.5}
    # Commerce. Prices include VAT; amounts are integer cents in STORE_CURRENCY.
    VAT_RATE_BPS = 1500  # Namibian VAT, 15%

    LOGIN_LIMIT_PER_IP = "5 per minute"
    LOGIN_FAILURE_LIMIT_PER_ACCOUNT = "10 per 15 minutes"
    REGISTER_LIMIT_PER_IP = "10 per hour"
    REVIEW_LIMIT_PER_USER = "10 per hour"
    PASSWORD_RESET_LIMIT_PER_IP = "5 per 15 minutes"
    PASSWORD_RESET_LIMIT_PER_EMAIL = "3 per hour"

    def __init__(self) -> None:
        self.FORGE_ENV_NAME = {
            ProductionConfig: "production",
            DevelopmentConfig: "development",
            TestingConfig: "testing",
        }.get(type(self), "unknown")
        self.SECRET_KEY = _require("SECRET_KEY")
        self.JWT_SECRET_KEY = _jwt_key()
        for key, value in _payment_settings(production=isinstance(self, ProductionConfig)).items():
            setattr(self, key, value)
        self.SQLALCHEMY_DATABASE_URI = _require("DATABASE_URL")
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True, "pool_size": 10, "max_overflow": 20}
        self.REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/0")
        production = isinstance(self, ProductionConfig)
        self.LOG_FORMAT = os.environ.get("LOG_FORMAT", "json" if production else "text")
        self.LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")
        # Server-Timing on API responses (app and database time, statement count).
        self.SERVER_TIMING = os.environ.get("SERVER_TIMING", "true").lower() == "true"
        # Number of reverse proxies in front of the app whose X-Forwarded-* headers are trusted.
        self.TRUSTED_PROXY_COUNT = int(os.environ.get("TRUSTED_PROXY_COUNT", "0"))
        # A rotated refresh token presented again within this window (two tabs, a retried request)
        # gets its existing successor back instead of triggering family revocation.
        self.REFRESH_REUSE_GRACE = timedelta(seconds=int(os.environ.get("REFRESH_REUSE_GRACE_SECONDS", "10")))
        self.STORE_CURRENCY = os.environ.get("STORE_CURRENCY", "nad")
        # Day boundaries for sales reports.
        self.STORE_TIMEZONE = os.environ.get("STORE_TIMEZONE", "Africa/Windhoek")
        # Where product photos are served from (nginx in production, Flask in development).
        self.MEDIA_URL = os.environ.get("MEDIA_URL", "/media").rstrip("/")
        backend_dir = Path(__file__).resolve().parent.parent
        # Generated WebP files (a volume shared with nginx in production) and the photos they come from.
        self.MEDIA_ROOT = os.environ.get("MEDIA_ROOT", str(backend_dir / "media"))
        self.IMAGE_SOURCE_DIR = os.environ.get("IMAGE_SOURCE_DIR", str(backend_dir / "seed" / "images"))
        # Flask serves /media itself outside production; nginx does in production.
        self.SERVE_MEDIA = (
            os.environ.get("SERVE_MEDIA", "false" if isinstance(self, ProductionConfig) else "true") == "true"
        )
        self.SHIPPING_FLAT_CENTS = int(os.environ.get("SHIPPING_FLAT_CENTS", "15000"))
        self.FREE_SHIPPING_THRESHOLD_CENTS = int(os.environ.get("FREE_SHIPPING_THRESHOLD_CENTS", "500000"))
        self.RESERVATION_TTL = timedelta(minutes=int(os.environ.get("RESERVATION_TTL_MINUTES", "15")))
        self.MAIL_BACKEND = os.environ.get("MAIL_BACKEND", "smtp")
        self.MAIL_SERVER = _require("MAIL_SERVER") if production else os.environ.get("MAIL_SERVER", "127.0.0.1")
        self.MAIL_PORT = int(os.environ.get("MAIL_PORT", "587" if production else "1025"))
        self.MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true" if production else "false").lower() == "true"
        self.MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
        self.MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
        self.MAIL_FROM = os.environ.get("MAIL_FROM", "Forge <orders@forge.local>")
        # The store's public address, for links in emails. The Vite dev server outside production.
        self.PUBLIC_BASE_URL = (
            _require("PUBLIC_BASE_URL") if production else os.environ.get("PUBLIC_BASE_URL", "http://127.0.0.1:5173")
        ).rstrip("/")
        self.PASSWORD_RESET_TTL = timedelta(minutes=int(os.environ.get("PASSWORD_RESET_TTL_MINUTES", "30")))
        self.CELERY = {
            "broker_url": os.environ.get("CELERY_BROKER_URL", self.REDIS_URL.rsplit("/", 1)[0] + "/1"),
            "task_ignore_result": True,
            "task_acks_late": True,  # a worker that dies mid-task leaves it for another worker
            "worker_prefetch_multiplier": 1,
            "timezone": "UTC",
            "beat_schedule": BEAT_SCHEDULE,
        }


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SQLALCHEMY_RECORD_QUERIES = True
    REFRESH_COOKIE_SECURE = False  # plain http on the developer's machine
    CART_COOKIE_SECURE = False


class ProductionConfig(BaseConfig):
    pass


class TestingConfig(BaseConfig):
    TESTING = True

    def __init__(self) -> None:
        os.environ.setdefault("SECRET_KEY", "test-secret-not-for-production")
        os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-not-for-production-0123456789")
        # Tests never reach Stripe: the fake gateway, with a fixed secret for signed test webhooks.
        os.environ["PAYMENT_GATEWAY"] = "fake"
        os.environ["STRIPE_WEBHOOK_SECRET"] = TEST_WEBHOOK_SECRET
        os.environ.setdefault("DATABASE_URL", _require("TEST_DATABASE_URL"))
        super().__init__()
        self.SQLALCHEMY_DATABASE_URI = _require("TEST_DATABASE_URL")
        # Separate Redis database so test runs never touch development rate-limit or cache keys.
        self.REDIS_URL = _require("TEST_REDIS_URL")
        # Production falls back to in-memory counters after 0.5 s without Redis. A slow local
        # Redis must not trigger that here, or limit tests would silently count in memory; the
        # fallback has its own test against a port where nothing listens.
        self.RATELIMIT_STORAGE_OPTIONS = {"socket_connect_timeout": 5, "socket_timeout": 5}
        self.MAIL_BACKEND = "memory"
        # Tasks run inline in tests: no broker, and errors surface in the calling test.
        self.CELERY = self.CELERY | {"task_always_eager": True, "task_eager_propagates": True}
        self.SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}


CONFIGS = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
}
