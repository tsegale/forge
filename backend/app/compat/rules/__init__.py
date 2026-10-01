"""Compatibility rules, in the order they are reported within a severity."""

from .base import Rule
from .cooling import CoolerCapacityRule, CoolerFitRule, CoolerSocketRule
from .physical import FormFactorRule, GpuClearanceRule, PsuFormFactorRule
from .platform import MemoryRule, SocketRule

RULES: list[Rule] = [
    SocketRule(),
    MemoryRule(),
    FormFactorRule(),
    GpuClearanceRule(),
    PsuFormFactorRule(),
    CoolerSocketRule(),
    CoolerFitRule(),
    CoolerCapacityRule(),
]
