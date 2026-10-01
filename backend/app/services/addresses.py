"""A customer's address book. One default per type is guaranteed by a partial unique index;
making an address the default demotes the previous one in the same transaction."""

from __future__ import annotations

from sqlalchemy import select, update

from ..errors import NotFound
from ..extensions import db
from ..models import Address, User
from ..models.enums import AddressType
from ..schemas.addresses import AddressCreate, AddressUpdate


def list_addresses(user: User) -> list[Address]:
    return list(
        db.session.scalars(
            select(Address)
            .where(Address.user_id == user.id)
            .order_by(Address.type, Address.is_default.desc(), Address.id)
        )
    )


def get_owned(user: User, address_id: int) -> Address:
    """The user's address, or 404: other users' addresses are indistinguishable from missing ones."""
    address = db.session.scalar(select(Address).where(Address.id == address_id, Address.user_id == user.id))
    if address is None:
        raise NotFound("Address not found.")
    return address


def _demote_defaults(user: User, address_type: AddressType, keep_id: int | None = None) -> None:
    # Lock the user's addresses of this type so two concurrent "make default" requests serialise.
    db.session.execute(
        select(Address.id).where(Address.user_id == user.id, Address.type == address_type).with_for_update()
    )
    db.session.execute(
        update(Address)
        .where(Address.user_id == user.id, Address.type == address_type, Address.is_default, Address.id != keep_id)
        .values(is_default=False)
    )


def create(user: User, data: AddressCreate) -> Address:
    if data.is_default:
        _demote_defaults(user, data.type)
    address = Address(user_id=user.id, **data.model_dump())
    db.session.add(address)
    db.session.commit()
    return address


def update_address(address: Address, data: AddressUpdate) -> Address:
    changes = data.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        _demote_defaults(db.session.get(User, address.user_id), address.type, keep_id=address.id)
    for field, value in changes.items():
        setattr(address, field, value)
    db.session.commit()
    return address


def delete(address: Address) -> None:
    db.session.delete(address)
    db.session.commit()
