"""Reference data, plus business rules that must hold no matter which code path writes:
inventory provisioning, price history (monthly partitions), build slot limits,
the order state machine and its audit log.

Revision ID: 0002
Revises: 0001
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

COMPONENT_KINDS = [
    # code, label, max_per_build, required_in_build, sort_order
    ("cpu", "CPU", 1, True, 10),
    ("motherboard", "Motherboard", 1, True, 20),
    ("memory", "Memory kit", 4, True, 30),
    ("gpu", "Graphics card", 2, False, 40),
    ("storage", "Storage drive", 8, True, 50),
    ("psu", "Power supply", 1, True, 60),
    ("case", "Case", 1, True, 70),
    ("cooler", "CPU cooler", 1, False, 80),
    ("accessory", "Accessory", 20, False, 90),
]
SOCKETS = [("AM4", "AMD"), ("AM5", "AMD"), ("LGA1700", "Intel"), ("LGA1851", "Intel")]
BOARD_FORM_FACTORS = [("E-ATX", 305, 330), ("ATX", 305, 244), ("Micro-ATX", 244, 244), ("Mini-ITX", 170, 170)]
ORDER_TRANSITIONS = [
    ("pending_payment", "paid"),
    ("pending_payment", "cancelled"),
    ("paid", "fulfilling"),
    ("paid", "refunded"),
    ("fulfilling", "shipped"),
    ("fulfilling", "refunded"),
    ("shipped", "delivered"),
    ("delivered", "refunded"),
]

DB_LOGIC = r"""
-- ------------------------------------------------------------------ inventory provisioning
CREATE FUNCTION create_inventory_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO inventory (product_id) VALUES (NEW.id);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_products_create_inventory
    AFTER INSERT ON products
    FOR EACH ROW EXECUTE FUNCTION create_inventory_row();

-- ------------------------------------------------------------------ price history partitions
CREATE TABLE price_history_default PARTITION OF price_history DEFAULT;

-- Creates (idempotently) the monthly partition containing p_month. Rows that already
-- landed in the default partition for that range are moved before attaching, so the
-- function is safe to call late (e.g. from the Celery Beat maintenance job).
CREATE FUNCTION ensure_price_history_partition(p_month date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
    v_start date := date_trunc('month', p_month)::date;
    v_end   date := (date_trunc('month', p_month) + interval '1 month')::date;
    v_name  text := format('price_history_y%sm%s', to_char(v_start, 'YYYY'), to_char(v_start, 'MM'));
BEGIN
    IF to_regclass(v_name) IS NOT NULL THEN
        RETURN v_name;
    END IF;
    EXECUTE format('CREATE TABLE %I (LIKE price_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS)', v_name);
    EXECUTE format(
        'WITH moved AS (DELETE FROM price_history_default WHERE recorded_at >= %L AND recorded_at < %L RETURNING *)
         INSERT INTO %I SELECT * FROM moved', v_start, v_end, v_name);
    EXECUTE format('ALTER TABLE price_history ATTACH PARTITION %I FOR VALUES FROM (%L) TO (%L)',
                   v_name, v_start, v_end);
    RETURN v_name;
END $$;

SELECT ensure_price_history_partition((date_trunc('month', now()) + make_interval(months => m))::date)
FROM generate_series(-12, 3) AS m;

CREATE FUNCTION log_product_price() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.price_cents IS DISTINCT FROM OLD.price_cents THEN
        INSERT INTO price_history (product_id, price_cents) VALUES (NEW.id, NEW.price_cents);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_products_log_price
    AFTER INSERT OR UPDATE OF price_cents ON products
    FOR EACH ROW EXECUTE FUNCTION log_product_price();

-- ------------------------------------------------------------------ append-only audit tables
CREATE FUNCTION forbid_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = 'object_not_in_prerequisite_state',
        MESSAGE = format('%s is append-only', TG_TABLE_NAME);
END $$;

CREATE TRIGGER trg_price_history_append_only
    BEFORE UPDATE ON price_history FOR EACH ROW EXECUTE FUNCTION forbid_update();
CREATE TRIGGER trg_order_status_history_append_only
    BEFORE UPDATE ON order_status_history FOR EACH ROW EXECUTE FUNCTION forbid_update();

-- ------------------------------------------------------------------ build slot limits
-- e.g. at most one CPU, up to four memory kits. Locks the parent build row so two
-- concurrent inserts into the same build are serialised and cannot both slip past.
CREATE FUNCTION enforce_build_slot_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_limit smallint;
    v_label text;
    v_total integer;
BEGIN
    PERFORM 1 FROM builds WHERE id = NEW.build_id FOR UPDATE;
    SELECT max_per_build, label INTO v_limit, v_label FROM component_kinds WHERE code = NEW.kind_code;
    SELECT coalesce(sum(quantity), 0) INTO v_total
      FROM build_items WHERE build_id = NEW.build_id AND kind_code = NEW.kind_code;
    IF v_total > v_limit THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'build_slot_limit',
            MESSAGE = format('A build can hold at most %s x %s (requested %s)', v_limit, v_label, v_total);
    END IF;
    RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER trg_build_items_slot_limit
    AFTER INSERT OR UPDATE OF quantity, kind_code ON build_items
    FOR EACH ROW EXECUTE FUNCTION enforce_build_slot_limit();

-- ------------------------------------------------------------------ order state machine
CREATE FUNCTION enforce_order_status_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT EXISTS (
        SELECT 1 FROM order_status_transitions
         WHERE from_status = OLD.status AND to_status = NEW.status
    ) THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'order_status_transition',
            MESSAGE = format('Illegal order status transition: %s -> %s', OLD.status, NEW.status);
    END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER trg_orders_status_guard
    BEFORE UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION enforce_order_status_transition();

-- The acting user is passed in by the app with SET LOCAL forge.actor_id = '<id>'.
CREATE FUNCTION log_order_status() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id)
        VALUES (
            NEW.id,
            CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
            NEW.status,
            nullif(current_setting('forge.actor_id', true), '')::integer
        );
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_orders_status_audit
    AFTER INSERT OR UPDATE OF status ON orders
    FOR EACH ROW EXECUTE FUNCTION log_order_status();
"""

DROP_DB_LOGIC = """
DROP TRIGGER IF EXISTS trg_orders_status_audit ON orders;
DROP TRIGGER IF EXISTS trg_orders_status_guard ON orders;
DROP TRIGGER IF EXISTS trg_build_items_slot_limit ON build_items;
DROP TRIGGER IF EXISTS trg_order_status_history_append_only ON order_status_history;
DROP TRIGGER IF EXISTS trg_price_history_append_only ON price_history;
DROP TRIGGER IF EXISTS trg_products_log_price ON products;
DROP TRIGGER IF EXISTS trg_products_create_inventory ON products;
DROP FUNCTION IF EXISTS log_order_status();
DROP FUNCTION IF EXISTS enforce_order_status_transition();
DROP FUNCTION IF EXISTS enforce_build_slot_limit();
DROP FUNCTION IF EXISTS forbid_update();
DROP FUNCTION IF EXISTS log_product_price();
DROP FUNCTION IF EXISTS ensure_price_history_partition(date);
DROP FUNCTION IF EXISTS create_inventory_row();
"""


def _values(rows):
    def lit(v):
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, int):
            return str(v)
        return "'" + str(v).replace("'", "''") + "'"

    return ", ".join("(" + ", ".join(lit(v) for v in row) + ")" for row in rows)


def upgrade():
    op.execute(
        "INSERT INTO component_kinds (code, label, max_per_build, required_in_build, sort_order) VALUES "
        + _values(COMPONENT_KINDS)
    )
    op.execute("INSERT INTO sockets (code, vendor) VALUES " + _values(SOCKETS))
    op.execute("INSERT INTO board_form_factors (code, width_mm, depth_mm) VALUES " + _values(BOARD_FORM_FACTORS))
    op.execute(
        "INSERT INTO order_status_transitions (from_status, to_status) VALUES " + _values(ORDER_TRANSITIONS)
    )
    op.execute(DB_LOGIC)


def downgrade():
    op.execute(DROP_DB_LOGIC)
    op.execute(
        "DO $$ DECLARE r record; BEGIN "
        "FOR r IN SELECT inhrelid::regclass AS part FROM pg_inherits WHERE inhparent = 'price_history'::regclass "
        "LOOP EXECUTE format('DROP TABLE %s', r.part); END LOOP; END $$"
    )
    for table in ("order_status_transitions", "board_form_factors", "sockets", "component_kinds"):
        op.execute(f"DELETE FROM {table}")
