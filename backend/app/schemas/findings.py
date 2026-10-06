"""One compatibility finding, shared by build reports and candidate parts in the catalog."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FindingResponse(BaseModel):
    code: str = Field(description="Stable identifier, e.g. SOCKET_MISMATCH.")
    severity: str = Field(description="conflict: cannot work as specified. warning: works, needs attention.")
    message: str
    product_ids: list[int]
    details: dict[str, Any] = Field(description="The measured values behind the finding.")

    @classmethod
    def from_finding(cls, f: Any) -> FindingResponse:
        return cls(
            code=f.code,
            severity=f.severity.value,
            message=f.message,
            product_ids=list(f.product_ids),
            details=dict(f.details),
        )
