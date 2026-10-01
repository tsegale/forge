"""Product listing: filters, sorting and keyset pagination.

Keyset (seek) pagination compares ``(sort_key, id)`` with the last row of the previous page
instead of using OFFSET, so every page costs the same and rows inserted or deleted between
requests never cause duplicates or gaps. The cursor is signed and bound to the query it came
from: a tampered cursor, or one replayed against different filters, is rejected.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from flask import current_app
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import ColumnElement, Select, select, tuple_
from sqlalchemy.orm import selectin_polymorphic, selectinload

from ..errors import BadRequest, ValidationFailed
from ..extensions import db
from ..models import (
    BoardFormFactor,
    Brand,
    CaseProduct,
    Category,
    CoolerProduct,
    CpuProduct,
    GpuProduct,
    Inventory,
    MemoryProduct,
    MotherboardProduct,
    Product,
    PsuProduct,
    Socket,
    StorageProduct,
)
from ..models.enums import KindCode
from ..schemas.catalog import ProductPage, ProductQuery
from .catalog import SUBTYPES, to_summary

KIND_CLASSES: dict[KindCode, type[Product]] = {
    KindCode.CPU: CpuProduct,
    KindCode.MOTHERBOARD: MotherboardProduct,
    KindCode.MEMORY: MemoryProduct,
    KindCode.GPU: GpuProduct,
    KindCode.STORAGE: StorageProduct,
    KindCode.PSU: PsuProduct,
    KindCode.CASE: CaseProduct,
    KindCode.COOLER: CoolerProduct,
}

Predicate = Callable[[Any], ColumnElement[bool]]


def _contains(column: Any) -> Predicate:
    return lambda v: column.ilike(f"%{_escape_like(v)}%", escape="\\")


# Spec filter name -> {kind it applies to -> predicate builder}. One registry keeps the query
# model, validation, and SQL in agreement.
SPEC_FILTERS: dict[str, dict[KindCode, Predicate]] = {
    "socket": {
        KindCode.CPU: lambda v: CpuProduct.socket_code == v,
        KindCode.MOTHERBOARD: lambda v: MotherboardProduct.socket_code == v,
        KindCode.COOLER: lambda v: CoolerProduct.supported_sockets.any(Socket.code == v),
    },
    "memory_type": {
        KindCode.MOTHERBOARD: lambda v: MotherboardProduct.memory_type == v,
        KindCode.MEMORY: lambda v: MemoryProduct.memory_type == v,
    },
    "form_factor": {
        KindCode.MOTHERBOARD: lambda v: MotherboardProduct.form_factor_code == v,
        KindCode.CASE: lambda v: CaseProduct.supported_form_factors.any(BoardFormFactor.code == v),
        KindCode.PSU: lambda v: PsuProduct.form_factor == v,
        KindCode.STORAGE: lambda v: StorageProduct.form_factor == v,
    },
    "chipset": {
        KindCode.MOTHERBOARD: _contains(MotherboardProduct.chipset),
        KindCode.GPU: _contains(GpuProduct.chipset),
    },
    "cores_min": {KindCode.CPU: lambda v: CpuProduct.cores >= v},
    "has_integrated_graphics": {KindCode.CPU: lambda v: CpuProduct.has_integrated_graphics.is_(v)},
    "capacity_min_gb": {
        KindCode.MEMORY: lambda v: MemoryProduct.total_capacity_gb >= v,
        KindCode.STORAGE: lambda v: StorageProduct.capacity_gb >= v,
    },
    "speed_min_mts": {KindCode.MEMORY: lambda v: MemoryProduct.speed_mts >= v},
    "vram_min_gb": {KindCode.GPU: lambda v: GpuProduct.vram_gb >= v},
    "length_max_mm": {KindCode.GPU: lambda v: GpuProduct.length_mm <= v},
    "fits_gpu_length_mm": {KindCode.CASE: lambda v: CaseProduct.max_gpu_length_mm >= v},
    "fits_cooler_height_mm": {KindCode.CASE: lambda v: CaseProduct.max_cooler_height_mm >= v},
    "height_max_mm": {KindCode.COOLER: lambda v: CoolerProduct.height_mm <= v},
    "cooler_type": {KindCode.COOLER: lambda v: CoolerProduct.cooler_type == v},
    "wattage_min_w": {KindCode.PSU: lambda v: PsuProduct.wattage_w >= v},
    "efficiency": {KindCode.PSU: lambda v: PsuProduct.efficiency == v},
    "modularity": {KindCode.PSU: lambda v: PsuProduct.modularity == v},
    "interface": {KindCode.STORAGE: lambda v: StorageProduct.interface == v},
}


@dataclass(frozen=True, slots=True)
class SortKey:
    column: Any
    descending: bool
    encode: Callable[[Any], Any] = lambda v: v
    decode: Callable[[Any], Any] = lambda v: v


SORTS: dict[str, SortKey] = {
    "price": SortKey(Product.price_cents, descending=False),
    "-price": SortKey(Product.price_cents, descending=True),
    "name": SortKey(Product.name, descending=False),
    "-name": SortKey(Product.name, descending=True),
    "newest": SortKey(Product.created_at, descending=True, encode=datetime.isoformat, decode=datetime.fromisoformat),
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _serializer() -> URLSafeSerializer:
    return URLSafeSerializer(current_app.config["SECRET_KEY"], salt="forge.catalog.cursor")


def _fingerprint(params: ProductQuery) -> str:
    """Hash of everything that defines the result set, so a cursor only resumes its own query."""
    defining = params.model_dump(mode="json", exclude={"cursor", "limit"}, exclude_none=True)
    return hashlib.sha256(json.dumps(defining, sort_keys=True).encode()).hexdigest()[:16]


def _decode_cursor(params: ProductQuery, sort: SortKey) -> tuple[Any, int] | None:
    if params.cursor is None:
        return None
    try:
        payload = _serializer().loads(params.cursor)
        if payload["q"] != _fingerprint(params):
            raise BadRequest("The cursor belongs to a different query.", code="cursor_mismatch")
        value, last_id = payload["k"]
        return sort.decode(value), int(last_id)
    except BadRequest:
        raise
    except (BadSignature, KeyError, TypeError, ValueError) as exc:
        raise BadRequest("The cursor is invalid.", code="invalid_cursor") from exc


def _encode_cursor(params: ProductQuery, sort: SortKey, product: Product) -> str:
    value = getattr(product, sort.column.key)
    return _serializer().dumps({"q": _fingerprint(params), "k": [sort.encode(value), product.id]})


def _category_subtree(slug: str) -> Select[tuple[int]]:
    root = select(Category.id).where(Category.slug == slug).cte("subtree", recursive=True)
    root = root.union_all(select(Category.id).where(Category.parent_id == root.c.id))
    return select(root.c.id)


def _spec_predicates(params: ProductQuery) -> list[ColumnElement[bool]]:
    used = {name: getattr(params, name) for name in SPEC_FILTERS if getattr(params, name) is not None}
    if not used:
        return []
    if params.kind is None:
        raise ValidationFailed(
            "Spec filters require a kind.",
            details=[
                {"field": name, "message": "Requires the 'kind' parameter.", "type": "kind_required"} for name in used
            ],
        )
    unsupported = [name for name in used if params.kind not in SPEC_FILTERS[name]]
    if unsupported:
        raise ValidationFailed(
            f"Some filters do not apply to {params.kind.value} products.",
            details=[
                {
                    "field": name,
                    "message": f"Not available for kind '{params.kind.value}'.",
                    "type": "filter_not_applicable",
                }
                for name in unsupported
            ],
        )
    return [SPEC_FILTERS[name][params.kind](value) for name, value in used.items()]


def build_query(params: ProductQuery) -> Select[tuple[Product]]:
    entity = KIND_CLASSES.get(params.kind, Product) if params.kind else Product
    stmt = select(entity).where(Product.is_active).options(selectinload(Product.inventory))
    if entity is Product:
        stmt = stmt.options(selectin_polymorphic(Product, SUBTYPES))
    if params.kind is not None:
        stmt = stmt.where(Product.kind_code == params.kind.value)
    if params.category:
        stmt = stmt.where(Product.category_id.in_(_category_subtree(params.category)))
    if params.brand:
        stmt = stmt.where(Product.brand_id.in_(select(Brand.id).where(Brand.slug.in_(params.brand))))
    if params.min_price is not None:
        stmt = stmt.where(Product.price_cents >= params.min_price)
    if params.max_price is not None:
        stmt = stmt.where(Product.price_cents <= params.max_price)
    if params.in_stock is not None:
        available = (
            select(Inventory.product_id)
            .where(Inventory.quantity_on_hand - Inventory.quantity_reserved > 0)
            .scalar_subquery()
        )
        stmt = stmt.where(Product.id.in_(available) if params.in_stock else Product.id.not_in(available))
    return stmt.where(*_spec_predicates(params))


def _seek(stmt: Select[tuple[Product]], sort: SortKey, after: tuple[Any, int]) -> Select[tuple[Product]]:
    value, last_id = after
    row = tuple_(sort.column, Product.id)
    return stmt.where(row < tuple_(value, last_id) if sort.descending else row > tuple_(value, last_id))


def list_products(params: ProductQuery) -> ProductPage:
    sort = SORTS[params.sort]
    stmt = build_query(params)
    after = _decode_cursor(params, sort)
    if after is not None:
        stmt = _seek(stmt, sort, after)
    order = (sort.column.desc(), Product.id.desc()) if sort.descending else (sort.column.asc(), Product.id.asc())
    rows = db.session.scalars(stmt.order_by(*order).limit(params.limit + 1)).all()

    page, has_more = rows[: params.limit], len(rows) > params.limit
    return ProductPage(
        items=[to_summary(p) for p in page],
        next_cursor=_encode_cursor(params, sort, page[-1]) if has_more else None,
    )
