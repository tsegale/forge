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
from decimal import Decimal
from typing import Any

from flask import current_app
from itsdangerous import BadSignature, URLSafeSerializer
from sqlalchemy import ColumnElement, Numeric, Select, case, cast, func, literal, or_, select, tuple_
from sqlalchemy.orm import selectin_polymorphic, selectinload

from ..compat import BuildContext, Part
from ..compat.context import SINGLE_SLOT_KINDS
from ..compat.findings import Severity
from ..compat.rules import RULES
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
from .catalog import SUBTYPES, load_products, to_summary

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


# Search relevance is rounded to fixed-precision NUMERIC so the keyset comparison on it is exact.
RELEVANCE_SCALE = 6
SUBSTRING_BONUS = 0.5


def _relevance_sort(q: str) -> SortKey:
    tsquery = func.websearch_to_tsquery("english", q)
    score = (
        func.ts_rank_cd(Product.search_vector, tsquery)
        + func.word_similarity(q, Product.name)
        + case((_substring(q), SUBSTRING_BONUS), else_=0.0)
    )
    return SortKey(func.round(cast(score, Numeric), RELEVANCE_SCALE), descending=True, encode=str, decode=Decimal)


SORTS: dict[str, SortKey] = {
    "price": SortKey(Product.price_cents, descending=False),
    "-price": SortKey(Product.price_cents, descending=True),
    "name": SortKey(Product.name, descending=False),
    "-name": SortKey(Product.name, descending=True),
    "newest": SortKey(Product.created_at, descending=True, encode=datetime.isoformat, decode=datetime.fromisoformat),
}


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def ilike_contains(column: Any, text: str) -> ColumnElement[bool]:
    """Case-insensitive "contains", with LIKE metacharacters in ``text`` matched literally."""
    return column.ilike(f"%{_escape_like(text)}%", escape="\\")


def _substring(q: str) -> ColumnElement[bool]:
    return or_(ilike_contains(Product.name, q), ilike_contains(Product.sku, q))


def _search(q: str) -> ColumnElement[bool]:
    """Full-text for words and stems, trigram ILIKE for fragments inside a token ("x3d" in
    "7800X3D"), trigram word similarity for typos ("ryzn"). Both trigram paths use the GIN index."""
    return or_(
        Product.search_vector.op("@@")(func.websearch_to_tsquery("english", q)),
        _substring(q),
        literal(q).op("<%")(Product.name),
    )


def resolve_sort(params: ProductQuery) -> SortKey:
    if params.sort == "relevance" or (params.sort is None and params.q):
        if not params.q:
            raise ValidationFailed(
                "Sorting by relevance requires a search query.",
                details=[{"field": "sort", "message": "Requires the 'q' parameter.", "type": "q_required"}],
            )
        return _relevance_sort(params.q)
    return SORTS[params.sort or "name"]


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


def _encode_cursor(params: ProductQuery, sort: SortKey, sort_value: Any, product_id: int) -> str:
    return _serializer().dumps({"q": _fingerprint(params), "k": [sort.encode(sort_value), product_id]})


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


def compatibility_base(params: ProductQuery) -> BuildContext | None:
    """The build that candidates are judged against: the compatible_with parts, minus the part
    a candidate of a single-slot kind would replace."""
    if params.compatible_with is None:
        return None
    if params.kind is None:
        raise ValidationFailed(
            "compatible_with requires a kind.",
            details=[
                {"field": "compatible_with", "message": "Requires the 'kind' parameter.", "type": "kind_required"}
            ],
        )
    products = load_products(list(dict.fromkeys(params.compatible_with)))
    unknown = [pid for pid in params.compatible_with if pid not in products]
    if unknown:
        raise ValidationFailed(
            "Some compatible_with products do not exist.",
            details=[
                {"field": "compatible_with", "message": f"Unknown product id {pid}.", "type": "product_unknown"}
                for pid in unknown
            ],
        )
    quantities: dict[int, int] = {}
    for pid in params.compatible_with:  # a repeated id means more than one of that part
        quantities[pid] = quantities.get(pid, 0) + 1
    ctx = BuildContext(Part(products[pid], qty) for pid, qty in quantities.items())
    return ctx.without_kind(params.kind) if params.kind in SINGLE_SLOT_KINDS else ctx


def _compatibility_predicates(base: BuildContext, kind: KindCode) -> list[ColumnElement[bool]]:
    """Each rule's conflicts, as SQL over candidates of ``kind``. Warnings never filter."""
    return [p for rule in RULES if (p := rule.compatible_filter(base, kind)) is not None]


def _candidate_warnings(base: BuildContext, product: Product) -> list[str]:
    candidate = base.with_candidate(product)
    codes = {
        f.code
        for rule in RULES
        for f in rule.check(candidate)
        if f.severity is Severity.WARNING and product.id in f.product_ids
    }
    return sorted(codes)


def build_query(params: ProductQuery, base: BuildContext | None = None) -> Select[tuple[Product]]:
    entity = KIND_CLASSES.get(params.kind, Product) if params.kind else Product
    stmt = select(entity).where(Product.is_active).options(selectinload(Product.inventory))
    if entity is Product:
        stmt = stmt.options(selectin_polymorphic(Product, SUBTYPES))
    if params.kind is not None:
        stmt = stmt.where(Product.kind_code == params.kind.value)
    if params.q:
        stmt = stmt.where(_search(params.q))
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
    stmt = stmt.where(*_spec_predicates(params))
    if base is not None and params.kind is not None:
        stmt = stmt.where(*_compatibility_predicates(base, params.kind))
    return stmt


def _seek(stmt: Select[tuple[Product]], sort: SortKey, after: tuple[Any, int]) -> Select[tuple[Product]]:
    value, last_id = after
    row = tuple_(sort.column, Product.id)
    return stmt.where(row < tuple_(value, last_id) if sort.descending else row > tuple_(value, last_id))


def list_products(params: ProductQuery) -> ProductPage:
    sort = resolve_sort(params)
    base = compatibility_base(params)
    # The sort key is selected alongside each product so the cursor carries the exact value
    # the database compared, including computed keys such as search relevance.
    stmt = build_query(params, base).add_columns(sort.column.label("sort_key"))
    after = _decode_cursor(params, sort)
    if after is not None:
        stmt = _seek(stmt, sort, after)
    order = (sort.column.desc(), Product.id.desc()) if sort.descending else (sort.column.asc(), Product.id.asc())
    rows = db.session.execute(stmt.order_by(*order).limit(params.limit + 1)).all()

    page, has_more = rows[: params.limit], len(rows) > params.limit
    last = page[-1] if page else None
    return ProductPage(
        items=[_summarise(product, base) for product, _ in page],
        next_cursor=_encode_cursor(params, sort, last.sort_key, last[0].id) if has_more and last else None,
    )


def _summarise(product: Product, base: BuildContext | None):
    summary = to_summary(product)
    if base is not None:
        summary.compatibility_warnings = _candidate_warnings(base, product)
    return summary
