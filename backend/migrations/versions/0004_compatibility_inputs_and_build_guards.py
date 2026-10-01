"""Compatibility engine inputs, and build integrity rules.

* cpu_specs.includes_cooler: the retail box ships with a cooler.
* psu_specs.atx_version: ATX 3.x supplies tolerate 200% power excursions; 2.x do not.
  Both are backfilled with conservative values (no cooler, no excursion tolerance) and then
  made explicit-only; `flask seed catalog` sets the verified values for the seeded parts.
* Build item guard (one BEFORE trigger on build_items):
  - locks the parent build row, so item changes serialise with POST /builds/{id}/validate;
  - refuses any change to the items of an ordered build (constraint build_locked), and a
    separate guard on builds refuses deleting an ordered build;
  - resets a validated build to draft, so "validated" can never describe stale items.
    The reset only matches status = 'validated', so it can never touch an ordered build.

Revision ID: 0004
Revises: 0003
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

ATX_VERSION = postgresql.ENUM("2.x", "3.0", "3.1", name="psu_atx_version")

BUILD_ITEM_GUARD = """
CREATE FUNCTION guard_build_items() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_build_id bigint;
    v_status build_status;
BEGIN
    FOREACH v_build_id IN ARRAY CASE TG_OP
        WHEN 'INSERT' THEN ARRAY[NEW.build_id]
        WHEN 'DELETE' THEN ARRAY[OLD.build_id]
        ELSE ARRAY[OLD.build_id, NEW.build_id]
    END LOOP
        SELECT status INTO v_status FROM builds WHERE id = v_build_id FOR UPDATE;
        IF v_status = 'ordered' THEN
            RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'build_locked',
                MESSAGE = format('Build %s has been ordered and its parts can no longer change', v_build_id);
        END IF;
        UPDATE builds SET status = 'draft' WHERE id = v_build_id AND status = 'validated';
    END LOOP;
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END $$;

CREATE TRIGGER trg_build_items_guard
    BEFORE INSERT OR UPDATE OR DELETE ON build_items
    FOR EACH ROW EXECUTE FUNCTION guard_build_items();

-- Deleting a build cascades to its items after the build row is gone, so the item guard cannot
-- see the build's status. Guard the build row itself, before the cascade starts.
CREATE FUNCTION guard_ordered_build_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'ordered' THEN
        RAISE EXCEPTION USING ERRCODE = 'check_violation', CONSTRAINT = 'build_locked',
            MESSAGE = format('Build %s has been ordered and cannot be deleted', OLD.id);
    END IF;
    RETURN OLD;
END $$;

CREATE TRIGGER trg_builds_guard_delete
    BEFORE DELETE ON builds
    FOR EACH ROW EXECUTE FUNCTION guard_ordered_build_delete();
"""


def upgrade():
    op.add_column("cpu_specs", sa.Column("includes_cooler", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("cpu_specs", "includes_cooler", server_default=None)

    ATX_VERSION.create(op.get_bind())
    op.add_column("psu_specs", sa.Column("atx_version", ATX_VERSION, nullable=False, server_default="2.x"))
    op.alter_column("psu_specs", "atx_version", server_default=None)

    op.execute(BUILD_ITEM_GUARD)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_builds_guard_delete ON builds")
    op.execute("DROP FUNCTION IF EXISTS guard_ordered_build_delete()")
    op.execute("DROP TRIGGER IF EXISTS trg_build_items_guard ON build_items")
    op.execute("DROP FUNCTION IF EXISTS guard_build_items()")
    op.drop_column("psu_specs", "atx_version")
    ATX_VERSION.drop(op.get_bind())
    op.drop_column("cpu_specs", "includes_cooler")
