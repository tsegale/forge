"""Checkout and payment integrity: reservations move stock, paid needs a matching payment.

* Stock reservations keep inventory in step, enforced by a trigger rather than application code:
  a new reservation adds to quantity_reserved; committing it moves the units out of both reserved
  and on hand; releasing or expiring it returns them. A released or expired reservation can be
  committed directly (a late payment re-reserving stock). Every change bumps inventory.version,
  so an admin edit made with a stale ETag cannot overwrite a sale. The existing CHECK constraints
  then make overselling impossible from any code path.
* Every transition into 'paid' requires a succeeded payment for the order whose amount and
  currency match the order total (constraint order_payment_required).
* New transitions for late payments: cancelled -> paid (stock re-reserved), cancelled -> refunded.
* payment_events: append-only record of payment outcomes, including ones that are not status
  changes. orders.confirmation_sent_at makes the confirmation email exactly-once.
* payment_status gains 'canceled' (PaymentIntent cancelled by the sweeper or the customer).

Revision ID: 0005
Revises: 0004
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

PAYMENT_EVENT_KIND = postgresql.ENUM(
    "intent_created", "succeeded", "failed", "canceled", "amount_mismatch", "late_payment_reserved",
    "late_payment_refund_pending", "late_payment_refunded", "refund_requested", "refunded", "refund_failed",
    name="payment_event_kind",
)
PAYMENT_STATUS_BEFORE = ("requires_payment", "processing", "succeeded", "failed", "refunded")

DB_LOGIC = r"""
-- ------------------------------------------------------------------ reservations move stock
CREATE FUNCTION apply_reservation_to_inventory() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_reserved integer := 0;
    v_on_hand integer := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'active' THEN
            RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_transition',
                MESSAGE = 'A new stock reservation must be active';
        END IF;
        v_reserved := NEW.quantity;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status = 'active' THEN
            RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_transition',
                MESSAGE = 'An active stock reservation must be released, not deleted';
        END IF;
        RETURN OLD;
    ELSE
        IF (NEW.order_id, NEW.product_id, NEW.quantity) IS DISTINCT FROM (OLD.order_id, OLD.product_id, OLD.quantity) THEN
            RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_transition',
                MESSAGE = 'A stock reservation''s order, product and quantity cannot change';
        END IF;
        IF NEW.status = OLD.status THEN
            RETURN NEW;
        END IF;
        IF OLD.status = 'active' AND NEW.status IN ('released', 'expired') THEN
            v_reserved := -OLD.quantity;
        ELSIF OLD.status = 'active' AND NEW.status = 'committed' THEN
            v_reserved := -OLD.quantity;
            v_on_hand := -OLD.quantity;
        ELSIF OLD.status IN ('released', 'expired') AND NEW.status = 'committed' THEN
            v_on_hand := -OLD.quantity;  -- late payment: take the units straight from stock on hand
        ELSE
            RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'reservation_transition',
                MESSAGE = format('Illegal stock reservation transition: %s -> %s', OLD.status, NEW.status);
        END IF;
        IF NEW.status <> 'active' AND NEW.resolved_at IS NULL THEN
            NEW.resolved_at := clock_timestamp();
        END IF;
    END IF;

    UPDATE inventory
       SET quantity_reserved = quantity_reserved + v_reserved,
           quantity_on_hand = quantity_on_hand + v_on_hand,
           version = version + 1,
           updated_at = now()
     WHERE product_id = NEW.product_id;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_stock_reservations_inventory
    BEFORE INSERT OR UPDATE OR DELETE ON stock_reservations
    FOR EACH ROW EXECUTE FUNCTION apply_reservation_to_inventory();

-- ------------------------------------------------------------------ paid requires a matching payment
CREATE FUNCTION require_matching_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'paid'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid')
       AND NOT EXISTS (
           SELECT 1 FROM payments p
            WHERE p.order_id = NEW.id
              AND p.status = 'succeeded'
              AND p.amount_cents = NEW.total_cents
              AND lower(p.currency) = lower(NEW.currency)
       ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'order_payment_required',
            MESSAGE = format('Order %s cannot be paid without a succeeded payment of %s %s',
                             NEW.order_number, NEW.total_cents, NEW.currency);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_paid_guard
    BEFORE INSERT OR UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION require_matching_payment();

-- ------------------------------------------------------------------ payment_events is append-only
CREATE TRIGGER trg_payment_events_append_only
    BEFORE UPDATE ON payment_events FOR EACH ROW EXECUTE FUNCTION forbid_update();
"""

DROP_DB_LOGIC = """
DROP TRIGGER IF EXISTS trg_payment_events_append_only ON payment_events;
DROP TRIGGER IF EXISTS trg_orders_paid_guard ON orders;
DROP FUNCTION IF EXISTS require_matching_payment();
DROP TRIGGER IF EXISTS trg_stock_reservations_inventory ON stock_reservations;
DROP FUNCTION IF EXISTS apply_reservation_to_inventory();
"""


def upgrade():
    # ADD VALUE is allowed in a transaction on PostgreSQL 12+; the value is not used until later.
    op.execute("ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'canceled' BEFORE 'refunded'")

    op.add_column("orders", sa.Column("confirmation_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_orders_pending_reservation_expiry",
        "orders",
        ["reservation_expires_at"],
        postgresql_where=sa.text("status = 'pending_payment'"),
    )

    PAYMENT_EVENT_KIND.create(op.get_bind())
    op.create_table(
        "payment_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("payment_id", sa.Integer(), nullable=True),
        sa.Column("kind", postgresql.ENUM(name="payment_event_kind", create_type=False), nullable=False),
        sa.Column("details", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("clock_timestamp()"), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], name=op.f("fk_payment_events_order_id_orders"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], name=op.f("fk_payment_events_payment_id_payments"), ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], name=op.f("fk_payment_events_actor_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_payment_events")),
    )
    op.create_index(op.f("ix_payment_events_order_id"), "payment_events", ["order_id"])

    op.execute("INSERT INTO order_status_transitions (from_status, to_status) VALUES ('cancelled', 'paid'), ('cancelled', 'refunded')")
    op.execute(DB_LOGIC)


def downgrade():
    op.execute(DROP_DB_LOGIC)
    op.execute(
        "DELETE FROM order_status_transitions WHERE from_status = 'cancelled' AND to_status IN ('paid', 'refunded')"
    )
    op.drop_index(op.f("ix_payment_events_order_id"), table_name="payment_events")
    op.drop_table("payment_events")
    PAYMENT_EVENT_KIND.drop(op.get_bind())
    op.drop_index("ix_orders_pending_reservation_expiry", table_name="orders")
    op.drop_column("orders", "confirmation_sent_at")

    # PostgreSQL cannot drop an enum value: rebuild the type without 'canceled'.
    op.execute("UPDATE payments SET status = 'failed' WHERE status = 'canceled'")
    op.execute("ALTER TYPE payment_status RENAME TO payment_status_old")
    op.execute(f"CREATE TYPE payment_status AS ENUM ({', '.join(repr(v) for v in PAYMENT_STATUS_BEFORE)})")
    op.execute("ALTER TABLE payments ALTER COLUMN status TYPE payment_status USING status::text::payment_status")
    op.execute("DROP TYPE payment_status_old")
