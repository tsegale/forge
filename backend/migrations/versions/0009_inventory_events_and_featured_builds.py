"""Inventory events, written by trigger, and featured builds.

* inventory_events: one row for every change to a product's stock (on hand or reserved), written
  by an AFTER trigger on inventory, so checkout, reservations, the sweeper, admin edits and seeds
  are all captured without any of them having to remember. The acting user comes from
  forge.actor_id, like the order audit log. Append-only, except that deleting a user may blank the
  actor (the same now applies to order_status_history, where it used to block deleting any user
  who had changed an order). Existing stock is recorded once as the starting point.
* builds.is_featured (shown on the home page) requires is_public (CHECK featured_requires_public).
  Being validated is not part of the CHECK: any edit returns a build to draft, and the featured
  query filters on status instead. featured_blurb is the one-line description on the home page.

Revision ID: 0009
Revises: 0008
"""
import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

DB_LOGIC = r"""
CREATE FUNCTION log_inventory_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO inventory_events (product_id, on_hand_before, on_hand_after, reserved_before, reserved_after, actor_id)
        VALUES (NEW.product_id, 0, NEW.quantity_on_hand, 0, NEW.quantity_reserved,
                nullif(current_setting('forge.actor_id', true), '')::integer);
    ELSIF (NEW.quantity_on_hand, NEW.quantity_reserved) IS DISTINCT FROM (OLD.quantity_on_hand, OLD.quantity_reserved) THEN
        INSERT INTO inventory_events (product_id, on_hand_before, on_hand_after, reserved_before, reserved_after, actor_id)
        VALUES (NEW.product_id, OLD.quantity_on_hand, NEW.quantity_on_hand, OLD.quantity_reserved,
                NEW.quantity_reserved, nullif(current_setting('forge.actor_id', true), '')::integer);
    END IF;
    RETURN NULL;
END $$;

CREATE TRIGGER trg_inventory_log_change
    AFTER INSERT OR UPDATE OF quantity_on_hand, quantity_reserved ON inventory
    FOR EACH ROW EXECUTE FUNCTION log_inventory_change();

-- Append-only, except that deleting a user may blank who did it (ON DELETE SET NULL): the event
-- itself is kept. TG_ARGV[0] names the actor column. Also used for order_status_history, which
-- had the plain forbid_update and so made any user who had acted impossible to delete.
CREATE FUNCTION forbid_update_except_actor_erasure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF (to_jsonb(NEW) - TG_ARGV[0]) = (to_jsonb(OLD) - TG_ARGV[0]) AND (to_jsonb(NEW) ->> TG_ARGV[0]) IS NULL THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'object_not_in_prerequisite_state',
        MESSAGE = format('%s is append-only', TG_TABLE_NAME);
END $$;

CREATE TRIGGER trg_inventory_events_append_only
    BEFORE UPDATE ON inventory_events
    FOR EACH ROW EXECUTE FUNCTION forbid_update_except_actor_erasure('actor_id');

DROP TRIGGER trg_order_status_history_append_only ON order_status_history;
CREATE TRIGGER trg_order_status_history_append_only
    BEFORE UPDATE ON order_status_history
    FOR EACH ROW EXECUTE FUNCTION forbid_update_except_actor_erasure('changed_by_user_id');

-- The starting point for stock that existed before this revision.
INSERT INTO inventory_events (product_id, on_hand_before, on_hand_after, reserved_before, reserved_after)
SELECT product_id, 0, quantity_on_hand, 0, quantity_reserved FROM inventory;
"""

DROP_DB_LOGIC = r"""
DROP TRIGGER IF EXISTS trg_order_status_history_append_only ON order_status_history;
CREATE TRIGGER trg_order_status_history_append_only
    BEFORE UPDATE ON order_status_history FOR EACH ROW EXECUTE FUNCTION forbid_update();
DROP TRIGGER IF EXISTS trg_inventory_events_append_only ON inventory_events;
DROP TRIGGER IF EXISTS trg_inventory_log_change ON inventory;
DROP FUNCTION IF EXISTS log_inventory_change();
DROP FUNCTION IF EXISTS forbid_update_except_actor_erasure();
"""


def upgrade():
    op.create_table(
        "inventory_events",
        sa.Column("id", sa.BigInteger(), sa.Identity(always=True), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("on_hand_before", sa.Integer(), nullable=False),
        sa.Column("on_hand_after", sa.Integer(), nullable=False),
        sa.Column("reserved_before", sa.Integer(), nullable=False),
        sa.Column("reserved_after", sa.Integer(), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_inventory_events_actor_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name=op.f("fk_inventory_events_product_id_products"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_inventory_events")),
    )
    with op.batch_alter_table("inventory_events", schema=None) as batch_op:
        batch_op.create_index("ix_inventory_events_product_occurred", ["product_id", "occurred_at"], unique=False)

    with op.batch_alter_table("builds", schema=None) as batch_op:
        batch_op.add_column(sa.Column("is_featured", sa.Boolean(), server_default=sa.text("false"), nullable=False))
        batch_op.add_column(sa.Column("featured_blurb", sa.String(length=200), nullable=True))
        batch_op.create_check_constraint("featured_requires_public", "NOT is_featured OR is_public")
        batch_op.create_index("ix_builds_featured", ["id"], unique=False, postgresql_where=sa.text("is_featured"))

    op.execute(DB_LOGIC)


def downgrade():
    op.execute(DROP_DB_LOGIC)
    with op.batch_alter_table("builds", schema=None) as batch_op:
        batch_op.drop_index("ix_builds_featured", postgresql_where=sa.text("is_featured"))
        batch_op.drop_constraint(op.f("ck_builds_featured_requires_public"), type_="check")
        batch_op.drop_column("featured_blurb")
        batch_op.drop_column("is_featured")

    with op.batch_alter_table("inventory_events", schema=None) as batch_op:
        batch_op.drop_index("ix_inventory_events_product_occurred")
    op.drop_table("inventory_events")
