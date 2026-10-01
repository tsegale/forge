"""Compatibility rules, in the order they are reported within a severity."""

from .base import Rule
from .platform import MemoryRule, SocketRule

RULES: list[Rule] = [SocketRule(), MemoryRule()]
