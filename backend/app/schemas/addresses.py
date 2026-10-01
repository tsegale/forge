"""Address book payloads. Checkout also accepts an inline AddressIn."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from ..models.enums import AddressType

Line = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OptionalLine = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]
Country = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{2}$")]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\+?[0-9 ()-]{6,31}$")]


class AddressIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    phone: Phone | None = None
    line1: Line
    line2: OptionalLine | None = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    region: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    postal_code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    country_code: Country = Field(default="NA", description="ISO 3166-1 alpha-2; defaults to Namibia.")


class AddressCreate(AddressIn):
    type: AddressType
    is_default: bool = False


class AddressUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)] | None = None
    phone: Phone | None = None
    line1: Line | None = None
    line2: OptionalLine | None = None
    city: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)] | None = None
    region: Annotated[str, StringConstraints(strip_whitespace=True, max_length=100)] | None = None
    postal_code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)] | None = None
    country_code: Country | None = None
    is_default: bool | None = None

    @model_validator(mode="after")
    def _required_fields_cannot_be_cleared(self) -> AddressUpdate:
        cleared = [
            f
            for f in ("recipient_name", "line1", "city", "country_code", "is_default")
            if f in self.model_fields_set and getattr(self, f) is None
        ]
        if cleared:
            raise ValueError(f"These fields cannot be null: {', '.join(cleared)}.")
        return self


class AddressResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: AddressType
    recipient_name: str
    phone: str | None
    line1: str
    line2: str | None
    city: str
    region: str | None
    postal_code: str | None
    country_code: str
    is_default: bool


class AddressList(BaseModel):
    items: list[AddressResponse]
