"""Cart: lines saved for later, kept in the cart but out of totals and checkout.

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-06 21:55:14.783385

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("cart_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("saved_for_later", sa.Boolean(), server_default=sa.text("false"), nullable=False))


def downgrade():
    with op.batch_alter_table("cart_items", schema=None) as batch_op:
        batch_op.drop_column("saved_for_later")
