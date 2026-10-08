"""Request validation and OpenAPI generation from the same Pydantic models.

``@api.validate(query=..., json=..., resp=...)`` validates the request before the view runs
(validated models are on ``request.context``) and documents the route in the OpenAPI spec.
Validation failures are re-raised as ``ValidationFailed`` so they use the shared error envelope.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import BaseModel, Field
from spectree import Response, SecurityScheme, SecuritySchemeData, SpecTree
from spectree.models import SecureType

from ..errors import APIError, ValidationFailed, validation_details
from .docs import PAGE_TEMPLATES

logger = logging.getLogger(__name__)


def _before(req: Any, resp: Any, req_validation_error: Exception | None, instance: Any, model_adapter: Any) -> None:
    if req_validation_error is not None:
        raise ValidationFailed(details=validation_details(req_validation_error))


def _after(req: Any, resp: Any, resp_validation_error: Exception | None, instance: Any, model_adapter: Any) -> None:
    if resp_validation_error is not None:
        # The server broke its own contract: never leak the invalid payload to the client.
        logger.error("Response failed schema validation for %s %s: %s", req.method, req.path, resp_validation_error)
        raise APIError()


class ErrorBody(BaseModel):
    """The error envelope every 4xx and 5xx response carries."""

    code: str = Field(description="Stable, machine-readable error code.")
    message: str = Field(description="Human-readable explanation; may change.")
    details: object | None = Field(default=None, description="Per-field problems for validation errors.")
    request_id: str | None = Field(default=None, description="Echoed in the X-Request-ID header.")


class ErrorResponse(BaseModel):
    """The envelope every error response uses."""

    error: ErrorBody


api = SpecTree(
    "flask",
    title="Forge API",
    version="1.1.3",
    description="PC hardware marketplace with a database-enforced build compatibility engine.",
    path="api/docs",
    mode="strict",
    annotations=False,
    before=_before,
    after=_after,
    # spectree documents a 422 on every validated route; make it describe our envelope.
    validation_error_model=ErrorResponse,
    # Plain model names in the published document (spectree appends a hash by default).
    naming_strategy=lambda model: model.__name__,
    nested_naming_strategy=lambda parent, child: child,
    page_templates=PAGE_TEMPLATES,  # pinned, integrity-checked assets (see docs.py)
    security_schemes=[
        SecurityScheme(
            name="bearerAuth",
            data=SecuritySchemeData(type=SecureType.HTTP, scheme="bearer", bearer_format="JWT"),
        )
    ],
)


def responses(*error_statuses: int, **success: type[BaseModel] | None) -> Response:
    """``responses(404, 409, HTTP_200=Model)``: success models plus documented error statuses,
    all of which use the shared error envelope."""
    return Response(**success, **{f"HTTP_{status}": ErrorResponse for status in error_statuses})


def register_docs(app: Any) -> None:
    """Serve the spec at /api/docs/openapi.json with Swagger UI (/api/docs) and Redoc beside it.

    Routes are discovered from ``current_app``, so the spec always describes the serving app;
    the generated document is cached per process, which matches one app per process."""
    api.register(app)

    from .docs import init_app

    init_app(app)
