"""One error envelope for every failure the API can produce.

Every error response has the same shape, whatever raised it (our own code, Werkzeug routing,
request validation, a database constraint, or an unexpected bug)::

    {"error": {"code": "email_taken", "message": "...", "details": null, "request_id": "..."}}

``code`` is a stable, machine-readable identifier that clients may branch on; ``message`` is
human-readable and may change.
"""

from __future__ import annotations

import logging
import re
import uuid
from typing import Any

from flask import Flask, Response, g, jsonify, request
from pydantic import ValidationError
from sqlalchemy.exc import DBAPIError
from werkzeug.exceptions import HTTPException

from .db_errors import map_database_error
from .extensions import db

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")


class APIError(Exception):
    """Base for errors raised deliberately by application code."""

    status = 500
    code = "internal_error"
    message = "An unexpected error occurred."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        status: int | None = None,
        details: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.status = status or self.status
        self.details = details
        self.headers = headers or {}
        super().__init__(self.message)


class BadRequest(APIError):
    status, code, message = 400, "bad_request", "The request could not be processed."


class Unauthorized(APIError):
    status, code, message = 401, "unauthorized", "Authentication is required."

    def __init__(self, message: str | None = None, **kwargs: Any) -> None:
        kwargs.setdefault("headers", {"WWW-Authenticate": 'Bearer realm="forge"'})
        super().__init__(message, **kwargs)


class Forbidden(APIError):
    status, code, message = 403, "forbidden", "You do not have permission to perform this action."


class NotFound(APIError):
    status, code, message = 404, "not_found", "The requested resource was not found."


class Conflict(APIError):
    status, code, message = 409, "conflict", "The request conflicts with the current state of the resource."


class PreconditionFailed(APIError):
    status, code, message = 412, "precondition_failed", "The resource has changed since you last read it."


class ValidationFailed(APIError):
    status, code, message = 422, "validation_failed", "The request contains invalid data."


class PreconditionRequired(APIError):
    status, code, message = 428, "precondition_required", "This request must be conditional (send If-Match)."


def error_response(
    status: int, code: str, message: str, details: Any = None, headers: dict[str, str] | None = None
) -> Response:
    body = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": g.get("request_id"),
        }
    }
    response = jsonify(body)
    response.status_code = status
    for name, value in (headers or {}).items():
        response.headers[name] = value
    return response


def validation_details(exc: ValidationError) -> list[dict[str, str]]:
    """Flatten Pydantic errors into ``[{"field": "items.0.qty", "message": ..., "type": ...}]``."""
    return [
        {"field": ".".join(str(part) for part in err["loc"]), "message": err["msg"], "type": err["type"]}
        for err in exc.errors(include_url=False, include_input=False)
    ]


def _snake(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def _assign_request_id() -> None:
    incoming = request.headers.get(REQUEST_ID_HEADER, "")
    g.request_id = incoming if _VALID_REQUEST_ID.match(incoming) else uuid.uuid4().hex


def _echo_request_id(response: Response) -> Response:
    if "request_id" in g:
        response.headers[REQUEST_ID_HEADER] = g.request_id
    return response


def _handle_api_error(exc: APIError) -> Response:
    return error_response(exc.status, exc.code, exc.message, exc.details, exc.headers)


def _handle_http_exception(exc: HTTPException) -> Response:
    status = exc.code or 500
    # Preserve protocol headers such as Allow (405) and Retry-After, but not the HTML content type.
    headers = {k: v for k, v in exc.get_headers() if k.lower() != "content-type"}
    return error_response(status, _snake(exc.name), exc.description or exc.name, headers=headers)


def _handle_validation_error(exc: ValidationError) -> Response:
    err = ValidationFailed(details=validation_details(exc))
    return _handle_api_error(err)


def _handle_database_error(exc: DBAPIError) -> Response:
    db.session.rollback()
    mapped = map_database_error(exc)
    if mapped is None:
        return _handle_unexpected(exc)
    return error_response(mapped.status, mapped.code, mapped.message)


def _handle_unexpected(exc: Exception) -> Response:
    logger.exception("Unhandled error (request_id=%s)", g.get("request_id"), exc_info=exc)
    db.session.rollback()
    return error_response(APIError.status, APIError.code, APIError.message)


def register_error_handlers(app: Flask) -> None:
    app.before_request(_assign_request_id)
    app.after_request(_echo_request_id)
    app.register_error_handler(APIError, _handle_api_error)
    app.register_error_handler(HTTPException, _handle_http_exception)
    app.register_error_handler(ValidationError, _handle_validation_error)
    app.register_error_handler(DBAPIError, _handle_database_error)
    app.register_error_handler(Exception, _handle_unexpected)
