"""What a compatibility rule reports."""

from __future__ import annotations

import enum
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from ..models import Product


class Severity(enum.StrEnum):
    CONFLICT = "conflict"  # the build cannot work as specified
    WARNING = "warning"  # it can work, but something needs attention (an adapter, headroom, ...)


@dataclass(frozen=True, slots=True)
class Finding:
    code: str
    severity: Severity
    message: str
    product_ids: tuple[int, ...]
    details: Mapping[str, Any] = field(default_factory=dict)

    @property
    def sort_key(self) -> tuple[int, str, tuple[int, ...]]:
        return (0 if self.severity is Severity.CONFLICT else 1, self.code, self.product_ids)


def _ids(products: tuple[Product, ...]) -> tuple[int, ...]:
    return tuple(sorted(p.id for p in products))


def conflict(code: str, message: str, *products: Product, **details: Any) -> Finding:
    return Finding(code, Severity.CONFLICT, message, _ids(products), details)


def warning(code: str, message: str, *products: Product, **details: Any) -> Finding:
    return Finding(code, Severity.WARNING, message, _ids(products), details)
