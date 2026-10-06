"""Product detail: product images, and verified-purchase reviews enforced by the database.

* product_images: one row per photo, ordered by position. The storage key is a bare file name
  (CHECK storage_key_safe), so it can be joined onto the media root without path traversal.
* reviews.is_verified_purchase is computed by a BEFORE trigger from the reviewer's orders: true
  when an order of theirs containing the product is paid, fulfilling, shipped or delivered.
  Whatever a client sends is overwritten, from any code path. When an order's status changes,
  the reviewer's reviews of the products in it are recomputed (a review written before the
  payment cleared becomes verified; a refund takes the badge away).
* reviews.body becomes required, at least 10 characters after trimming (CHECK body_length).
* The single-column product index on reviews is replaced by (product_id, created_at), which
  serves both the product filter and the newest-first listing.

Revision ID: 0006
Revises: 0005
"""
import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

DB_LOGIC = r"""
CREATE FUNCTION has_purchased(p_user_id integer, p_product_id integer) RETURNS boolean
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.user_id = p_user_id
          AND oi.product_id = p_product_id
          AND o.status IN ('paid', 'fulfilling', 'shipped', 'delivered')
    )
$$;

CREATE FUNCTION set_review_verified_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.is_verified_purchase := has_purchased(NEW.user_id, NEW.product_id);
    RETURN NEW;
END $$;

CREATE TRIGGER trg_reviews_verified_purchase
    BEFORE INSERT OR UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION set_review_verified_purchase();

-- A no-op update fires the BEFORE trigger above, which recomputes the flag.
CREATE FUNCTION refresh_review_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE reviews r
    SET is_verified_purchase = r.is_verified_purchase
    WHERE r.user_id = NEW.user_id
      AND r.product_id IN (SELECT oi.product_id FROM order_items oi WHERE oi.order_id = NEW.id);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_orders_refresh_review_verification
    AFTER UPDATE OF status ON orders
    FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION refresh_review_verification();
"""

DROP_DB_LOGIC = r"""
DROP TRIGGER IF EXISTS trg_orders_refresh_review_verification ON orders;
DROP TRIGGER IF EXISTS trg_reviews_verified_purchase ON reviews;
DROP FUNCTION IF EXISTS refresh_review_verification();
DROP FUNCTION IF EXISTS set_review_verified_purchase();
DROP FUNCTION IF EXISTS has_purchased(integer, integer);
"""


def upgrade():
    op.create_table(
        "product_images",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("storage_key", sa.String(length=120), nullable=False),
        sa.Column("alt_text", sa.String(length=200), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("source_url", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "storage_key ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'", name=op.f("ck_product_images_storage_key_safe")
        ),
        sa.CheckConstraint("position >= 0", name=op.f("ck_product_images_position_non_negative")),
        sa.CheckConstraint("width > 0 AND height > 0", name=op.f("ck_product_images_dimensions_positive")),
        sa.ForeignKeyConstraint(
            ["product_id"], ["products.id"], name=op.f("fk_product_images_product_id_products"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_images")),
        sa.UniqueConstraint("product_id", "position", name="uq_product_images_product_position"),
        sa.UniqueConstraint("storage_key", name=op.f("uq_product_images_storage_key")),
    )

    # No API wrote reviews before this revision; a row that breaks the new rules fails the
    # upgrade loudly rather than being changed or dropped.
    with op.batch_alter_table("reviews", schema=None) as batch_op:
        batch_op.alter_column("body", existing_type=sa.Text(), nullable=False)
        batch_op.create_check_constraint("body_length", "char_length(btrim(body)) >= 10")
        batch_op.drop_index(batch_op.f("ix_reviews_product_id"))
        batch_op.create_index("ix_reviews_product_created", ["product_id", "created_at"], unique=False)

    op.execute(DB_LOGIC)
    op.execute("UPDATE reviews SET is_verified_purchase = has_purchased(user_id, product_id)")


def downgrade():
    op.execute(DROP_DB_LOGIC)
    with op.batch_alter_table("reviews", schema=None) as batch_op:
        batch_op.drop_index("ix_reviews_product_created")
        batch_op.create_index(batch_op.f("ix_reviews_product_id"), ["product_id"], unique=False)
        batch_op.drop_constraint(batch_op.f("ck_reviews_body_length"), type_="check")
        batch_op.alter_column("body", existing_type=sa.Text(), nullable=True)
    op.drop_table("product_images")
