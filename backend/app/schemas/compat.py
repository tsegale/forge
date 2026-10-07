"""Compatibility report payloads."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from ..compat import Report
from ..models.enums import BuildStatus
from .builds import Quantity
from .findings import FindingResponse


class PowerResponse(BaseModel):
    sustained_w: int = Field(description="Estimated continuous draw.")
    peak_w: int = Field(description="Estimated draw during graphics card power excursions.")
    recommended_psu_w: int = Field(description="Smallest ATX 3.x supply with comfortable headroom.")


class CompatibilityReport(BaseModel):
    compatible: bool = Field(description="No part conflicts with another.")
    complete: bool = Field(description="Nothing the build needs is missing.")
    conflicts: list[FindingResponse]
    warnings: list[FindingResponse]
    missing_kinds: list[str] = Field(
        description="Required kinds not present, including a gpu for CPUs without integrated graphics "
        "and a cooler for CPUs sold without one."
    )
    power: PowerResponse

    @classmethod
    def from_report(cls, report: Report) -> CompatibilityReport:
        return cls(
            compatible=report.compatible,
            complete=report.complete,
            conflicts=[FindingResponse.from_finding(f) for f in report.conflicts],
            warnings=[FindingResponse.from_finding(f) for f in report.warnings],
            missing_kinds=list(report.missing_kinds),
            power=PowerResponse(
                sustained_w=report.power.sustained_w,
                peak_w=report.power.peak_w,
                recommended_psu_w=report.power.recommended_psu_w,
            ),
        )


class BuildValidation(CompatibilityReport):
    status: BuildStatus = Field(description="validated only when the build is both compatible and complete.")


class CheckItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: int = Field(strict=True, ge=1)
    quantity: Quantity = 1


class CompatibilityCheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[CheckItem] = Field(max_length=50)
