"""The interface every compatibility rule implements."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from sqlalchemy import ColumnElement

from ...models.enums import KindCode
from ..context import BuildContext
from ..findings import Finding


class Rule(ABC):
    """One compatibility concern (socket, clearance, power, ...).

    ``check`` reports conflicts and warnings for a build. ``compatible_filter`` expresses the
    same rule's *conflicts* as a SQL predicate on candidate products of ``kind``, so the catalog
    can list only parts that would not conflict with the build. The two must agree; a parity
    test enforces it across the seeded catalog.
    """

    @abstractmethod
    def check(self, ctx: BuildContext) -> Iterator[Finding]: ...

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        """SQL predicate a candidate of ``kind`` must satisfy, or None if this rule cannot
        conflict for that kind given the current parts."""
        return None
