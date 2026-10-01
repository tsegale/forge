"""Generate docs/schema.dbml from the SQLAlchemy metadata, so the ER diagram can never
drift from the real schema. Paste the output into https://dbdiagram.io to render it.

    python scripts/export_dbml.py > ../docs/schema.dbml
"""

import os
import sys

from sqlalchemy import CheckConstraint, Enum, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects import postgresql

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("SECRET_KEY", "export")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused@localhost/unused")

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

GROUPS = {
    "Identity": ["users", "addresses", "refresh_tokens"],
    "Catalog": [
        "component_kinds",
        "sockets",
        "board_form_factors",
        "brands",
        "categories",
        "products",
        "cpu_specs",
        "motherboard_specs",
        "memory_specs",
        "gpu_specs",
        "storage_specs",
        "psu_specs",
        "case_specs",
        "case_supported_form_factors",
        "cooler_specs",
        "cooler_supported_sockets",
        "inventory",
        "price_history",
    ],
    "Builds": ["builds", "build_items"],
    "Commerce": [
        "carts",
        "cart_items",
        "orders",
        "order_items",
        "order_addresses",
        "order_status_transitions",
        "order_status_history",
        "stock_reservations",
        "payments",
        "processed_webhook_events",
    ],
    "Engagement": ["reviews", "price_alerts"],
}


def col_type(col) -> str:
    if isinstance(col.type, Enum):
        return col.type.name
    return col.type.compile(dialect=postgresql.dialect()).replace(" ", "_").lower()


def main() -> None:
    create_app("production")
    meta = db.Model.metadata
    out: list[str] = [
        "Project forge {",
        '  database_type: "PostgreSQL"',
        '  Note: "Generated from SQLAlchemy metadata. Do not edit by hand."',
        "}\n",
    ]
    enums: dict[str, list[str]] = {}

    for name in sorted(meta.tables):
        table = meta.tables[name]
        single_uniques = {
            next(iter(c.columns)).name
            for c in table.constraints
            if isinstance(c, UniqueConstraint) and len(c.columns) == 1
        }
        lines = [f"Table {name} {{"]
        for col in table.columns:
            if isinstance(col.type, Enum):
                enums[col.type.name] = list(col.type.enums)
            attrs = []
            if col.primary_key:
                attrs.append("pk")
            if col.unique or col.name in single_uniques:
                attrs.append("unique")
            if not col.nullable and not col.primary_key:
                attrs.append("not null")
            if col.computed is not None:
                attrs.append("note: 'generated'")
            lines.append(f"  {col.name} {col_type(col)}" + (f" [{', '.join(attrs)}]" if attrs else ""))
        composite = [c for c in table.constraints if isinstance(c, UniqueConstraint) and len(c.columns) > 1]
        if composite:
            lines.append("\n  indexes {")
            for c in composite:
                lines.append(f"    ({', '.join(col.name for col in c.columns)}) [unique]")
            lines.append("  }")
        checks = [c for c in table.constraints if isinstance(c, CheckConstraint)]
        if checks:
            note = "; ".join(str(c.sqltext).replace("'", "\\'") for c in checks)
            lines.append(f"\n  Note: 'CHECK: {note}'")
        lines.append("}\n")
        out.extend(lines)

    for name in sorted(meta.tables):
        for fk in meta.tables[name].constraints:
            if not isinstance(fk, ForeignKeyConstraint):
                continue
            src = ", ".join(c.name for c in fk.columns)
            ref_table = fk.elements[0].column.table.name
            dst = ", ".join(e.column.name for e in fk.elements)
            pk_cols = {c.name for c in meta.tables[name].primary_key.columns}
            # FK that *is* the primary key => one-to-one (spec subtypes, inventory).
            rel = "-" if {c.name for c in fk.columns} <= pk_cols and len(pk_cols) == len(fk.columns) else ">"
            if len(fk.columns) > 1:
                out.append(f"Ref: {name}.({src}) {rel} {ref_table}.({dst})")
            else:
                out.append(f"Ref: {name}.{src} {rel} {ref_table}.{dst}")

    out.append("")
    for enum_name, values in sorted(enums.items()):
        out.append(f"Enum {enum_name} {{")
        out.extend(f'  "{v}"' for v in values)
        out.append("}\n")

    for group, tables in GROUPS.items():
        out.append(f"TableGroup {group} {{")
        out.extend(f"  {t}" for t in tables if t in meta.tables)
        out.append("}\n")

    print("\n".join(out))


if __name__ == "__main__":
    main()
