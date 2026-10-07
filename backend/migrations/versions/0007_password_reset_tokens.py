"""Password reset tokens: hashed, single-use, short-lived, at most one live link per user.

The raw token only ever exists in the email link; the table holds its SHA-256 hash. Consumption is
one atomic UPDATE (used_at IS NULL AND expires_at > now()), so a link cannot be used twice even by
two concurrent requests. The partial unique index keeps one unused token per user; requesting a
new link marks the old one used first.

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-06 21:39:58.521755

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("token_hash ~ '^[0-9a-f]{64}$'", name=op.f("ck_password_reset_tokens_token_hash_hex")),
        sa.CheckConstraint("expires_at > created_at", name=op.f("ck_password_reset_tokens_expiry_after_creation")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_password_reset_tokens_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_password_reset_tokens")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_password_reset_tokens_token_hash")),
    )
    with op.batch_alter_table("password_reset_tokens", schema=None) as batch_op:
        batch_op.create_index(
            "uq_password_reset_tokens_one_active", ["user_id"], unique=True, postgresql_where=sa.text("used_at IS NULL")
        )


def downgrade():
    with op.batch_alter_table("password_reset_tokens", schema=None) as batch_op:
        batch_op.drop_index("uq_password_reset_tokens_one_active", postgresql_where=sa.text("used_at IS NULL"))

    op.drop_table("password_reset_tokens")
