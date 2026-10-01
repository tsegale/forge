"""Build compatibility engine: pure rules over a build's parts, no database access."""

from .context import BuildContext, Part
from .engine import Report, evaluate
from .findings import Finding, Severity
from .power import PowerEstimate

__all__ = ["BuildContext", "Finding", "Part", "PowerEstimate", "Report", "Severity", "evaluate"]
