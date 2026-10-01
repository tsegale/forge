"""Request validation and OpenAPI generation from the same Pydantic models.

``@api.validate(query=..., json=..., resp=...)`` validates the request before the view runs
(validated models are on ``request.context``) and documents the route in the OpenAPI spec.
Validation failures are re-raised as ``ValidationFailed`` so they use the shared error envelope.
"""

from __future__ import annotations

import logging
from typing import Any

from spectree import SpecTree

from ..errors import APIError, ValidationFailed, validation_details

logger = logging.getLogger(__name__)


def _before(req: Any, resp: Any, req_validation_error: Exception | None, instance: Any, model_adapter: Any) -> None:
    if req_validation_error is not None:
        raise ValidationFailed(details=validation_details(req_validation_error))


def _after(req: Any, resp: Any, resp_validation_error: Exception | None, instance: Any, model_adapter: Any) -> None:
    if resp_validation_error is not None:
        # The server broke its own contract: never leak the invalid payload to the client.
        logger.error("Response failed schema validation for %s %s: %s", req.method, req.path, resp_validation_error)
        raise APIError()


api = SpecTree(
    "flask",
    title="Forge API",
    version="1.0.0",
    description="PC hardware marketplace with a database-enforced build compatibility engine.",
    path="api/v1/docs",
    mode="strict",
    annotations=False,
    before=_before,
    after=_after,
)
