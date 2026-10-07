"""Shopping cart for guests and signed-in users.

Guests are identified by an opaque cart token in an HttpOnly cookie (SameSite=Lax, so it is not
sent on cross-site POSTs). Sending an access token switches to the user's own cart; at login a
guest cart is merged into it.
"""

from __future__ import annotations

from flask import Response, after_this_request, current_app, request

from ...models import Cart
from ...schemas.cart import CartItemCreate, CartItemUpdate, CartResponse
from ...security.guards import optional_user
from ...services import cart as cart_service
from ..spec import api, responses
from . import bp

TAG = "Cart"


def _guest_token():
    return cart_service.parse_token(request.cookies.get(current_app.config["CART_COOKIE_NAME"]))


def _remember_guest(cart: Cart) -> None:
    if cart.guest_token is None or cart.guest_token == _guest_token():
        return

    @after_this_request
    def attach(response: Response) -> Response:
        cfg = current_app.config
        response.set_cookie(
            cfg["CART_COOKIE_NAME"],
            str(cart.guest_token),
            max_age=int(cfg["CART_COOKIE_MAX_AGE"].total_seconds()),
            path=cfg["CART_COOKIE_PATH"],
            secure=cfg["CART_COOKIE_SECURE"],
            httponly=True,
            samesite="Lax",
        )
        return response


def _writable_cart() -> Cart:
    cart = cart_service.get_or_create(optional_user(), _guest_token())
    _remember_guest(cart)
    return cart


def _current_view() -> CartResponse:
    return cart_service.view(cart_service.find(optional_user(), _guest_token()))


@bp.get("/cart")
@api.validate(resp=responses(401, HTTP_200=CartResponse), tags=[TAG])
def get_cart():
    """The caller's cart with live prices, stock and VAT-inclusive totals. Reserves nothing."""
    return _current_view()


@bp.post("/cart/items")
@api.validate(json=CartItemCreate, resp=responses(401, 422, HTTP_200=CartResponse), tags=[TAG])
def add_cart_item():
    """Add a product. Adding one already in the cart increases its quantity (up to 99)."""
    body: CartItemCreate = request.context.json
    cart = _writable_cart()
    cart_service.add_item(cart, body.product_id, body.quantity)
    return cart_service.view(cart)


@bp.patch("/cart/items/<int:item_id>")
@api.validate(json=CartItemUpdate, resp=responses(401, 404, 422, HTTP_200=CartResponse), tags=[TAG])
def update_cart_item(item_id: int):
    """Set a line's quantity, or move it to saved for later and back. Saved lines stay in the
    cart but are left out of the totals, the item count and checkout."""
    body: CartItemUpdate = request.context.json
    cart_service.update_item(
        cart_service.find(optional_user(), _guest_token(), lock=True), item_id, body.quantity, body.saved_for_later
    )
    return _current_view()


@bp.delete("/cart/items/<int:item_id>")
@api.validate(resp=responses(401, 404, HTTP_200=CartResponse), tags=[TAG])
def remove_cart_item(item_id: int):
    """Remove a line."""
    cart_service.remove_item(cart_service.find(optional_user(), _guest_token(), lock=True), item_id)
    return _current_view()


@bp.delete("/cart")
@api.validate(resp=responses(401, HTTP_200=CartResponse), tags=[TAG])
def clear_cart():
    """Empty the cart. Lines saved for later stay saved."""
    cart_service.clear(cart_service.find(optional_user(), _guest_token(), lock=True))
    return _current_view()
