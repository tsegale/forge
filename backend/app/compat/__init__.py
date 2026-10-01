"""Build compatibility engine: pure rules over a build's parts, no database access."""

from .context import BuildContext, Part
from .engine import Report, evaluate
from .findings import Finding, Severity

__all__ = ["BuildContext", "Finding", "Part", "Report", "Severity", "evaluate"]
