"""A customer's PC builds. Every route acts only on the authenticated user's own builds."""

from __future__ import annotations

from flask import request

from ...schemas.builds import BuildCreate, BuildDetail, BuildItemCreate, BuildItemUpdate, BuildList, BuildUpdate
from ...security.guards import current_user, require_auth
from ...services import builds as build_service
from ..spec import api, responses
from . import bp

TAG = "Builds"
SECURITY = {"bearerAuth": []}


@bp.post("/builds")
@require_auth
@api.validate(json=BuildCreate, resp=responses(401, 422, HTTP_201=BuildDetail), tags=[TAG], security=SECURITY)
def create_build():
    """Start a new, empty build."""
    build = build_service.create(current_user(), request.context.json.name)
    return build_service.detail(build), 201


@bp.get("/builds")
@require_auth
@api.validate(resp=responses(401, HTTP_200=BuildList), tags=[TAG], security=SECURITY)
def list_builds():
    """The user's builds, most recently changed first."""
    return BuildList(items=build_service.list_builds(current_user()))


@bp.get("/builds/<int:build_id>")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=BuildDetail), tags=[TAG], security=SECURITY)
def get_build(build_id: int):
    """A build with its parts, prices and status."""
    return build_service.detail(build_service.get_owned(current_user(), build_id))


@bp.patch("/builds/<int:build_id>")
@require_auth
@api.validate(json=BuildUpdate, resp=responses(401, 404, 422, HTTP_200=BuildDetail), tags=[TAG], security=SECURITY)
def rename_build(build_id: int):
    """Rename a build."""
    build = build_service.get_owned(current_user(), build_id)
    return build_service.detail(build_service.rename(build, request.context.json.name))


@bp.delete("/builds/<int:build_id>")
@require_auth
@api.validate(resp=responses(401, 404, 409, HTTP_204=None), tags=[TAG], security=SECURITY)
def delete_build(build_id: int):
    """Delete a build. Ordered builds cannot be deleted (409 build_locked)."""
    build_service.delete(build_service.get_owned(current_user(), build_id))
    return "", 204


@bp.post("/builds/<int:build_id>/items")
@require_auth
@api.validate(
    json=BuildItemCreate, resp=responses(401, 404, 409, 422, HTTP_201=BuildDetail), tags=[TAG], security=SECURITY
)
def add_build_item(build_id: int):
    """Add a part. 409 if the build already holds the maximum of that kind, already contains the
    product, or has been ordered. A validated build returns to draft."""
    build = build_service.get_owned(current_user(), build_id)
    body: BuildItemCreate = request.context.json
    return build_service.detail(build_service.add_item(build, body.product_id, body.quantity)), 201


@bp.patch("/builds/<int:build_id>/items/<int:item_id>")
@require_auth
@api.validate(
    json=BuildItemUpdate, resp=responses(401, 404, 409, 422, HTTP_200=BuildDetail), tags=[TAG], security=SECURITY
)
def update_build_item(build_id: int, item_id: int):
    """Change a part's quantity."""
    build = build_service.get_owned(current_user(), build_id)
    return build_service.detail(build_service.update_item(build, item_id, request.context.json.quantity))


@bp.delete("/builds/<int:build_id>/items/<int:item_id>")
@require_auth
@api.validate(resp=responses(401, 404, 409, HTTP_200=BuildDetail), tags=[TAG], security=SECURITY)
def remove_build_item(build_id: int, item_id: int):
    """Remove a part and return the updated build."""
    build = build_service.get_owned(current_user(), build_id)
    return build_service.detail(build_service.remove_item(build, item_id))
