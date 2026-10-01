"""Compatibility checks: for a saved build (records the result) or for an unsaved part list."""

from __future__ import annotations

from flask import request

from ...schemas.compat import BuildValidation, CompatibilityCheckRequest, CompatibilityReport
from ...security.guards import current_user, require_auth
from ...services import compatibility
from ..spec import api, responses
from . import bp

TAG = "Compatibility"


@bp.post("/builds/<int:build_id>/validate")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=BuildValidation), tags=[TAG], security={"bearerAuth": []})
def validate_build(build_id: int):
    """Check a saved build and record the outcome: the build becomes validated only when it is
    both compatible (no conflicts) and complete (nothing missing); otherwise it returns to draft."""
    report, status = compatibility.validate_build(current_user(), build_id)
    return BuildValidation(**CompatibilityReport.from_report(report).model_dump(), status=status)


@bp.post("/compatibility/check")
@api.validate(json=CompatibilityCheckRequest, resp=responses(422, HTTP_200=CompatibilityReport), tags=[TAG])
def check():
    """Check a list of parts without saving anything, e.g. while a visitor configures a build."""
    return CompatibilityReport.from_report(compatibility.check_items(request.context.json.items))
