"""Authentication endpoints.

The access token is returned in the body and sent back as ``Authorization: Bearer``. The refresh
token only ever travels in an ``HttpOnly; Secure; SameSite=Strict`` cookie scoped to
``/api/v1/auth``, so page scripts cannot read it and browsers never attach it to other routes.
"""

from __future__ import annotations

from flask import Response, after_this_request, current_app, request
from spectree import Response as Resp

from ...errors import Unauthorized
from ...schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserResponse
from ...security.guards import current_user, require_auth
from ...services import auth as auth_service
from ...services.auth import IssuedSession
from ..spec import api
from . import bp

TAG = "Auth"


def _set_refresh_cookie(session: IssuedSession) -> None:
    @after_this_request
    def attach(response: Response) -> Response:
        cfg = current_app.config
        response.set_cookie(
            cfg["REFRESH_COOKIE_NAME"],
            session.refresh_token,
            expires=session.refresh_expires_at,
            path=cfg["REFRESH_COOKIE_PATH"],
            secure=cfg["REFRESH_COOKIE_SECURE"],
            httponly=True,
            samesite="Strict",
        )
        # Token responses must never be cached (RFC 6749, section 5.1).
        response.headers["Cache-Control"] = "no-store"
        return response


def _clear_refresh_cookie() -> None:
    @after_this_request
    def clear(response: Response) -> Response:
        cfg = current_app.config
        response.delete_cookie(
            cfg["REFRESH_COOKIE_NAME"],
            path=cfg["REFRESH_COOKIE_PATH"],
            secure=cfg["REFRESH_COOKIE_SECURE"],
            httponly=True,
            samesite="Strict",
        )
        return response


def _refresh_cookie() -> str | None:
    return request.cookies.get(current_app.config["REFRESH_COOKIE_NAME"])


def _token_response(session: IssuedSession) -> TokenResponse:
    _set_refresh_cookie(session)
    return TokenResponse(access_token=session.access.token, expires_in=session.access.expires_in)


@bp.post("/auth/register")
@api.validate(json=RegisterRequest, resp=Resp(HTTP_201=UserResponse), tags=[TAG])
def register():
    """Create a customer account."""
    user = auth_service.register(request.context.json)
    return UserResponse.model_validate(user), 201


@bp.post("/auth/login")
@api.validate(json=LoginRequest, resp=Resp(HTTP_200=TokenResponse), tags=[TAG])
def login():
    """Exchange credentials for an access token and a refresh cookie."""
    body: LoginRequest = request.context.json
    user = auth_service.authenticate(str(body.email), body.password)
    return _token_response(auth_service.start_session(user))


@bp.get("/auth/me")
@require_auth
@api.validate(resp=Resp(HTTP_200=UserResponse), tags=[TAG], security={"bearerAuth": []})
def me():
    """The authenticated user's profile."""
    return UserResponse.model_validate(current_user())


@bp.post("/auth/refresh")
@api.validate(resp=Resp(HTTP_200=TokenResponse), tags=[TAG])
def refresh():
    """Rotate the refresh cookie and issue a new access token. Reusing a rotated token ends the session."""
    token = _refresh_cookie()
    if not token:
        raise Unauthorized("No refresh token was sent.", code="missing_refresh_token")
    try:
        return _token_response(auth_service.rotate(token))
    except Unauthorized:
        _clear_refresh_cookie()
        raise


@bp.post("/auth/logout")
@api.validate(resp=Resp(HTTP_204=None), tags=[TAG])
def logout():
    """End this session (the refresh token family in the cookie). Always succeeds."""
    token = _refresh_cookie()
    if token:
        auth_service.end_session(token)
    _clear_refresh_cookie()
    return "", 204


@bp.post("/auth/logout-all")
@require_auth
@api.validate(resp=Resp(HTTP_204=None), tags=[TAG], security={"bearerAuth": []})
def logout_all():
    """End every session for the authenticated user, on every device."""
    auth_service.end_all_sessions(current_user())
    _clear_refresh_cookie()
    return "", 204
