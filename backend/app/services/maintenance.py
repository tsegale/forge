"""Scheduled database maintenance."""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import func, select

from ..extensions import db

PARTITION_MONTHS_AHEAD = 2


def _add_months(d: date, months: int) -> date:
    index = d.year * 12 + (d.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def ensure_price_history_partitions(today: date | None = None, months_ahead: int = PARTITION_MONTHS_AHEAD) -> list[str]:
    """Create monthly price_history partitions for this month and the next ``months_ahead``, so a
    price change never lands in the default partition. Idempotent (ensure_price_history_partition,
    migration 0002, returns the existing partition if it is already there)."""
    first = (today or datetime.now(UTC).date()).replace(day=1)
    names = [
        db.session.scalar(select(func.ensure_price_history_partition(_add_months(first, offset))))
        for offset in range(months_ahead + 1)
    ]
    db.session.commit()
    return names
