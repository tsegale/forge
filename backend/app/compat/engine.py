"""Run every rule over a build and assemble the report."""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass

from ..models.enums import KindCode
from .context import BuildContext
from .findings import Finding, Severity
from .power import PowerEstimate, estimate
from .rules import RULES
from .rules.base import Rule

KIND_ORDER = {kind.value: index for index, kind in enumerate(KindCode)}


@dataclass(frozen=True, slots=True)
class Report:
    findings: tuple[Finding, ...]
    missing_kinds: tuple[str, ...]
    power: PowerEstimate

    @property
    def conflicts(self) -> list[Finding]:
        return [f for f in self.findings if f.severity is Severity.CONFLICT]

    @property
    def warnings(self) -> list[Finding]:
        return [f for f in self.findings if f.severity is Severity.WARNING]

    @property
    def compatible(self) -> bool:
        """No part conflicts with another."""
        return not self.conflicts

    @property
    def complete(self) -> bool:
        """Nothing the build needs is missing."""
        return not self.missing_kinds


def missing_kinds(ctx: BuildContext, required_kinds: Iterable[str]) -> tuple[str, ...]:
    """Required kinds not in the build, plus kinds the chosen CPU makes necessary: a graphics
    card when it has no integrated graphics, a cooler when none comes in its box."""
    missing = set(required_kinds) - ctx.kinds
    cpu = ctx.cpu
    if cpu is not None:
        if not cpu.has_integrated_graphics and not ctx.gpus:
            missing.add(KindCode.GPU.value)
        if not cpu.includes_cooler and ctx.cooler is None:
            missing.add(KindCode.COOLER.value)
    return tuple(sorted(missing, key=lambda k: KIND_ORDER.get(k, len(KIND_ORDER))))


def evaluate(ctx: BuildContext, required_kinds: Iterable[str], rules: Sequence[Rule] = RULES) -> Report:
    findings = sorted((f for rule in rules for f in rule.check(ctx)), key=lambda f: f.sort_key)
    return Report(findings=tuple(findings), missing_kinds=missing_kinds(ctx, required_kinds), power=estimate(ctx))
