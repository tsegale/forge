"""The authenticated user's address book."""

from __future__ import annotations

from flask import request

from ...schemas.addresses import AddressCreate, AddressList, AddressResponse, AddressUpdate
from ...security.guards import current_user, require_auth
from ...services import addresses as address_service
from ..spec import api, responses
from . import bp

TAG = "Addresses"
SECURITY = {"bearerAuth": []}


@bp.get("/addresses")
@require_auth
@api.validate(resp=responses(401, HTTP_200=AddressList), tags=[TAG], security=SECURITY)
def list_addresses():
    """Saved addresses, grouped by type with the default first."""
    items = address_service.list_addresses(current_user())
    return AddressList(items=[AddressResponse.model_validate(a) for a in items])


@bp.post("/addresses")
@require_auth
@api.validate(
    json=AddressCreate, resp=responses(401, 409, 422, HTTP_201=AddressResponse), tags=[TAG], security=SECURITY
)
def create_address():
    """Save an address. Marking it default replaces the previous default of the same type."""
    return AddressResponse.model_validate(address_service.create(current_user(), request.context.json)), 201


@bp.get("/addresses/<int:address_id>")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_200=AddressResponse), tags=[TAG], security=SECURITY)
def get_address(address_id: int):
    """One saved address."""
    return AddressResponse.model_validate(address_service.get_owned(current_user(), address_id))


@bp.patch("/addresses/<int:address_id>")
@require_auth
@api.validate(
    json=AddressUpdate, resp=responses(401, 404, 409, 422, HTTP_200=AddressResponse), tags=[TAG], security=SECURITY
)
def update_address(address_id: int):
    """Change an address. Orders keep the snapshot taken at checkout."""
    address = address_service.get_owned(current_user(), address_id)
    return AddressResponse.model_validate(address_service.update_address(address, request.context.json))


@bp.delete("/addresses/<int:address_id>")
@require_auth
@api.validate(resp=responses(401, 404, HTTP_204=None), tags=[TAG], security=SECURITY)
def delete_address(address_id: int):
    """Delete a saved address. Past orders are unaffected (they hold a snapshot)."""
    address_service.delete(address_service.get_owned(current_user(), address_id))
    return "", 204
