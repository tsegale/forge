"""Database-level invariants. These must hold even if application code is bypassed."""

import pytest
from sqlalchemy import func, insert, select, text, update
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
    User,
)
from app.models.enums import OrderStatus
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
