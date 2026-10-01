"""Render docs/erd.svg and docs/erd.png from the SQLAlchemy metadata with Graphviz.

python scripts/render_erd.py ../docs
"""

import html
import os
import subprocess
import sys

from sqlalchemy import Enum, ForeignKeyConstraint
from sqlalchemy.dialects import postgresql

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("SECRET_KEY", "export")
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://unused@localhost/unused")

from export_dbml import GROUPS  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

GROUP_COLOURS = {
    "Identity": "#E8EEF7",
    "Catalog": "#EAF4EC",
    "Builds": "#FBF1E3",
    "Commerce": "#F3EAF5",
    "Engagement": "#F2F2F2",
}


def type_label(col) -> str:
    if isinstance(col.type, Enum):
        return col.type.name
    return col.type.compile(dialect=postgresql.dialect()).lower()


def node(table, fill: str) -> str:
    fk_cols = {c.name for fk in table.foreign_key_constraints for c in fk.columns}
    rows = [f'<tr><td colspan="3" bgcolor="{fill}" align="left"><b>{table.name}</b></td></tr>']
    for col in table.columns:
        key = "PK" if col.primary_key else ("FK" if col.name in fk_cols else "")
        null = "" if col.nullable else " *"
        key_cell = f'<font color="#6B7280">{key}</font>' if key else " "
        rows.append(
            f'<tr><td align="left">{key_cell}</td>'
            f'<td align="left" port="{col.name}">{html.escape(col.name)}{null}</td>'
            f'<td align="left"><font color="#6B7280">{html.escape(type_label(col))}</font></td></tr>'
        )
    table_open = '<table border="0" cellborder="1" cellspacing="0" cellpadding="4" color="#D1D5DB">'
    label = "<" + table_open + "".join(rows) + "</table>>"
    return f'  "{table.name}" [label={label}];'


def main(out_dir: str) -> None:
    create_app("production")
    meta = db.Model.metadata
    lines = [
        "digraph forge {",
        '  graph [rankdir=LR, fontname="Helvetica", bgcolor="white", nodesep=0.4, ranksep=1.1, pad=0.3];',
        '  node [shape=plaintext, fontname="Helvetica", fontsize=10];',
        '  edge [color="#9CA3AF", arrowhead=crow, arrowtail=none, dir=both, penwidth=1];',
    ]
    for group, tables in GROUPS.items():
        lines.append(f'  subgraph "cluster_{group}" {{ label="{group}"; fontsize=14; color="#E5E7EB"; style=rounded;')
        for name in tables:
            lines.append(node(meta.tables[name], GROUP_COLOURS[group]))
        lines.append("  }")
    seen: set[tuple[str, str]] = set()
    for name, table in meta.tables.items():
        for fk in table.constraints:
            if not isinstance(fk, ForeignKeyConstraint):
                continue
            target = fk.elements[0].column.table.name
            if (name, target) in seen:
                continue  # collapse the composite subtype FK onto the PK link
            seen.add((name, target))
            pk = {c.name for c in table.primary_key.columns}
            one_to_one = {c.name for c in fk.columns} == pk
            head = "teetee" if one_to_one else "crow"
            lines.append(f'  "{name}" -> "{target}" [arrowhead=tee, arrowtail={head}];')
    lines.append("}")
    dot = "\n".join(lines)
    os.makedirs(out_dir, exist_ok=True)
    for fmt in ("svg", "png"):
        subprocess.run(
            ["dot", f"-T{fmt}", "-Gdpi=110", "-o", os.path.join(out_dir, f"erd.{fmt}")],
            input=dot.encode(),
            check=True,
        )


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "../docs")
