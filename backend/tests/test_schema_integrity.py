"""Database-level invariants. These must hold even if application code is bypassed."""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.models import (
    Brand,
    Build,
    BuildItem,
    Category,
    CpuProduct,
    GpuProduct,
    Inventory,
    Order,
    OrderStatusHistory,
    PriceHistory,
    Product,
    PsuProduct,
    RefreshToken,
    User,
)
from app.models.enums import BuildStatus, OrderStatus, PsuAtxVersion
from app.services.audit import set_actor


@pytest.fixture()
def user(session):
    u = User(email="Builder@Example.com", password_hash="x", first_name="Test", last_name="User")
    session.add(u)
    session.flush()
    return u


def _constraint_name(exc: DBAPIError) -> str | None:
    return exc.orig.diag.constraint_name


# --------------------------------------------------------------------- polymorphism


def test_polymorphic_query_returns_typed_subclasses(session):
    kinds = {type(p) for p in session.scalars(select(Product))}
    assert CpuProduct in kinds and GpuProduct in kinds


def test_spec_row_cannot_attach_to_product_of_another_kind(session, product_by_sku):
    gpu = product_by_sku("FRG-GPU-NV-5080-FE")
    stmt = insert(CpuProduct.__table__).values(
        product_id=gpu.id,
        socket_code="AM5",
        cores=8,
        threads=16,
        base_clock_mhz=4000,
        boost_clock_mhz=5000,
        tdp_w=120,
        max_power_w=160,
        has_integrated_graphics=True,
        includes_cooler=False,
    )
    with pytest.raises(IntegrityError) as exc:
        session.execute(stmt)
    assert _constraint_name(exc.value) == "fk_cpu_specs_product_kind"


def test_product_must_sit_in_category_of_same_kind(session):
    brand = session.scalar(select(Brand).limit(1))
    gpu_category = session.scalar(select(Category).where(Category.slug == "graphics-cards"))
    cpu = CpuProduct(
        sku="FRG-TEST-1",
        slug="frg-test-1",
        name="Mis-filed CPU",
        brand=brand,
        category=gpu_category,
        category_id=gpu_category.id,
        price_cents=100,
        socket_code="AM5",
        cores=6,
        threads=12,
        base_clock_mhz=4000,
        boost_clock_mhz=5000,
        tdp_w=65,
        max_power_w=88,
        has_integrated_graphics=False,
    )
    session.add(cpu)
    with pytest.raises(IntegrityError) as exc:
        session.flush()
    assert _constraint_name(exc.value) == "fk_products_category_kind"


# --------------------------------------------------------------------- inventory & pricing


def test_every_product_has_an_inventory_row(session):
    missing = session.scalar(
        select(func.count()).select_from(Product).outerjoin(Inventory).where(Inventory.product_id.is_(None))
    )
    assert missing == 0


def test_reserved_stock_cannot_exceed_on_hand(session, product_by_sku):
    product = product_by_sku("FRG-GPU-NV-5090-FE")
    with pytest.raises(IntegrityError) as exc:
        session.execute(update(Inventory).where(Inventory.product_id == product.id).values(quantity_reserved=999))
    assert _constraint_name(exc.value) == "ck_inventory_reserved_le_on_hand"


def test_price_change_is_recorded_in_partitioned_history(session, product_by_sku):
    product = product_by_sku("FRG-CPU-R7-9800X3D")
    before = session.scalar(select(func.count()).where(PriceHistory.product_id == product.id))
    product.price_cents -= 50000
    session.flush()
    rows = session.scalars(
        select(PriceHistory).where(PriceHistory.product_id == product.id).order_by(PriceHistory.id)
    ).all()
    assert len(rows) == before + 1
    assert rows[-1].price_cents == product.price_cents
    partition = session.scalar(
        text("SELECT tableoid::regclass::text FROM price_history WHERE id = :id"), {"id": rows[-1].id}
    )
    assert partition.startswith("price_history_y")


def test_price_history_is_append_only(session):
    with pytest.raises(DBAPIError, match="append-only"):
        session.execute(update(PriceHistory).values(price_cents=1))


# --------------------------------------------------------------------- builds


def test_build_rejects_a_second_cpu(session, user, product_by_sku):
    build = Build(user_id=user.id, name="Two CPUs")
    build.items.append(BuildItem.for_product(product_by_sku("FRG-CPU-R7-7800X3D")))
    session.add(build)
    session.flush()

    build.items.append(BuildItem.for_product(product_by_sku("FRG-CPU-R5-7600X")))
    with pytest.raises(IntegrityError) as exc:
        session.flush()
    assert _constraint_name(exc.value) == "build_slot_limit"


def test_build_allows_multiple_memory_kits_up_to_limit(session, user, product_by_sku):
    build = Build(user_id=user.id, name="Lots of RAM")
    build.items.append(BuildItem.for_product(product_by_sku("FRG-RAM-CR-VEN-32-6000"), quantity=2))
    session.add(build)
    session.flush()
    build.items[0].quantity = 5
    with pytest.raises(IntegrityError):
        session.flush()


def test_build_item_kind_must_match_product(session, user, product_by_sku):
    build = Build(user_id=user.id, name="Lying item")
    session.add(build)
    session.flush()
    gpu = product_by_sku("FRG-GPU-NV-5070-FE")
    with pytest.raises(IntegrityError) as exc:
        session.execute(insert(BuildItem.__table__).values(build_id=build.id, product_id=gpu.id, kind_code="cpu"))
    assert _constraint_name(exc.value) == "fk_build_items_product_kind"


# --------------------------------------------------------------------- orders


def _order(session, user) -> Order:
    order = Order(user_id=user.id, currency="NAD", subtotal_cents=10000, total_cents=10000)
    session.add(order)
    session.flush()
    session.refresh(order)
    return order


def test_order_number_is_generated(session, user):
    assert _order(session, user).order_number.startswith("FRG-")


def test_order_total_must_be_consistent(session, user):
    session.add(Order(user_id=user.id, currency="NAD", subtotal_cents=100, tax_cents=15, total_cents=100))
    with pytest.raises(IntegrityError):
        session.flush()


def test_legal_transitions_are_audited_with_actor(session, user):
    order = _order(session, user)
    set_actor(session, user.id)
    order.status = OrderStatus.PAID
    session.flush()
    history = session.scalars(
        select(OrderStatusHistory).where(OrderStatusHistory.order_id == order.id).order_by(OrderStatusHistory.id)
    ).all()
    assert [(h.from_status, h.to_status) for h in history] == [
        (None, OrderStatus.PENDING_PAYMENT),
        (OrderStatus.PENDING_PAYMENT, OrderStatus.PAID),
    ]
    assert history[-1].changed_by_user_id == user.id


def test_illegal_transition_is_rejected(session, user):
    order = _order(session, user)
    order.status = OrderStatus.SHIPPED  # pending_payment -> shipped skips payment
    with pytest.raises(IntegrityError) as exc:
        session.flush()
    assert _constraint_name(exc.value) == "order_status_transition"


def test_email_uniqueness_is_case_insensitive(session, user):
    session.add(User(email="builder@EXAMPLE.com", password_hash="x", first_name="A", last_name="B"))
    with pytest.raises(IntegrityError):
        session.flush()


# --------------------------------------------------------------------- refresh tokens


def _refresh_token(user, **overrides) -> RefreshToken:
    jti = uuid.uuid4()
    values = {
        "jti": jti,
        "family_id": jti,
        "user_id": user.id,
        "expires_at": datetime.now(UTC) + timedelta(days=14),
    }
    return RefreshToken(**(values | overrides))


def test_refresh_token_requires_a_family(session, user):
    session.add(_refresh_token(user, family_id=None))
    with pytest.raises(IntegrityError) as exc:
        session.flush()
    assert exc.value.orig.diag.column_name == "family_id"


def test_rotated_refresh_token_must_be_revoked(session, user):
    session.add(_refresh_token(user, replaced_by_jti=uuid.uuid4()))
    with pytest.raises(IntegrityError) as exc:
        session.flush()
    assert _constraint_name(exc.value) == "ck_refresh_tokens_replaced_by_requires_revoked"


# --------------------------------------------------------------------- search


def test_trigram_index_uses_gin_trgm_ops(session):
    indexdef = session.scalar(text("SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_products_name_trgm'"))
    assert "USING gin" in indexdef and "gin_trgm_ops" in indexdef


def test_trigram_substring_finds_model_suffix(session):
    """Full-text search tokenises "7800X3D" as one word, so "x3d" needs a trigram-indexed ILIKE.
    Word similarity alone is not enough: only 2 of the 4 trigrams of "x3d" occur in "7800x3d"."""
    fts = session.scalars(
        select(Product.name).where(Product.search_vector.op("@@")(func.websearch_to_tsquery("english", "x3d")))
    ).all()
    substring = session.scalars(select(Product.name).where(Product.name.ilike("%x3d%"))).all()
    assert fts == []
    assert set(substring) == {"AMD Ryzen 7 7800X3D", "AMD Ryzen 7 9800X3D", "AMD Ryzen 7 5800X3D"}


def test_trigram_word_similarity_tolerates_typos(session):
    names = session.scalars(select(Product.name).where(Product.name.op("%>")("ryzn"))).all()
    assert names and all("Ryzen" in name for name in names)


# --------------------------------------------------------------------- build item guard (migration 0004)


@pytest.fixture()
def build_with_cpu(session, user, product_by_sku):
    build = Build(user_id=user.id, name="Guarded")
    build.items.append(BuildItem.for_product(product_by_sku("FRG-CPU-R7-7800X3D")))
    session.add(build)
    session.flush()
    return build


def _status(session, build) -> BuildStatus:
    session.expire(build, ["status"])
    return build.status


@pytest.mark.parametrize("change", ["insert", "update", "delete"])
def test_item_changes_reset_a_validated_build_to_draft(session, build_with_cpu, product_by_sku, change):
    build_with_cpu.status = BuildStatus.VALIDATED
    session.flush()
    if change == "insert":
        build_with_cpu.items.append(BuildItem.for_product(product_by_sku("FRG-RAM-CR-VEN-32-6000")))
    elif change == "update":
        session.execute(update(BuildItem).where(BuildItem.build_id == build_with_cpu.id).values(quantity=1))
    else:
        session.execute(delete(BuildItem).where(BuildItem.build_id == build_with_cpu.id))
    session.flush()
    assert _status(session, build_with_cpu) is BuildStatus.DRAFT


@pytest.mark.parametrize("change", ["insert", "update", "delete"])
def test_ordered_build_items_are_locked(session, build_with_cpu, product_by_sku, change):
    build_with_cpu.status = BuildStatus.ORDERED
    session.flush()
    with pytest.raises(IntegrityError) as exc, session.begin_nested():
        if change == "insert":
            session.execute(
                insert(BuildItem).values(
                    build_id=build_with_cpu.id,
                    product_id=product_by_sku("FRG-RAM-CR-VEN-32-6000").id,
                    kind_code="memory",
                    quantity=1,
                )
            )
        elif change == "update":
            session.execute(update(BuildItem).where(BuildItem.build_id == build_with_cpu.id).values(quantity=1))
        else:
            session.execute(delete(BuildItem).where(BuildItem.build_id == build_with_cpu.id))
    assert _constraint_name(exc.value) == "build_locked"
    assert _status(session, build_with_cpu) is BuildStatus.ORDERED  # the reset never touches ordered builds


def test_ordered_build_cannot_be_deleted(session, build_with_cpu):
    """The item cascade runs after the build row is gone, so the build row needs its own guard."""
    build_with_cpu.status = BuildStatus.ORDERED
    session.flush()
    with pytest.raises(IntegrityError) as exc, session.begin_nested():
        session.execute(delete(Build).where(Build.id == build_with_cpu.id))
    assert _constraint_name(exc.value) == "build_locked"


def test_draft_build_deletes_with_its_items(session, build_with_cpu):
    session.execute(delete(Build).where(Build.id == build_with_cpu.id))
    assert (
        session.scalar(select(func.count()).select_from(BuildItem).where(BuildItem.build_id == build_with_cpu.id)) == 0
    )


# --------------------------------------------------------------------- seeded compatibility inputs


def test_seeded_cpus_record_bundled_coolers(session):
    """Verified against AMD product pages and Intel's boxed-cooler support articles."""
    bundled = set(session.scalars(select(CpuProduct.sku).where(CpuProduct.includes_cooler)))
    assert bundled == {"FRG-CPU-R5-5600X", "FRG-CPU-I5-12400F"}


def test_seeded_psus_record_atx_version(session):
    versions = dict(session.execute(select(PsuProduct.sku, PsuProduct.atx_version)).all())
    assert versions["FRG-PSU-CM-MWE550"] is PsuAtxVersion.V2
    assert versions["FRG-PSU-CR-SF750"] is PsuAtxVersion.V2
    assert versions["FRG-PSU-BQ-PP12M-650"] is PsuAtxVersion.V3_0
    assert {versions[s] for s in ("FRG-PSU-SS-GX750", "FRG-PSU-CR-RM850E", "FRG-PSU-CR-RM1000X")} == {
        PsuAtxVersion.V3_1
    }
