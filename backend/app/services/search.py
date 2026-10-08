"""Search-as-you-type suggestions: the best few products per component kind, and a spelling
correction from the catalog's own vocabulary when nothing matches.

Uses the same matching as GET /products?q= (full text, trigram substring, word similarity), so a
suggestion never promises results the full search page will not show.
"""

from __future__ import annotations

import re

from sqlalchemy import Numeric, cast, func, select, text

from ..extensions import db
from ..models import Product
from ..schemas.catalog import SearchSuggestions, SuggestionGroup
from .catalog import load_products, to_summary
from .catalog_query import relevance_score, search_predicate

# A correction must look like the typed word to this degree (pg_trgm similarity, 0 to 1).
CORRECTION_THRESHOLD = 0.3


def suggest(q: str, per_kind: int) -> SearchSuggestions:
    """Search-box suggestions: the best matches per kind, ranked by relevance."""
    q = " ".join(q.split())
    score = cast(relevance_score(q), Numeric)
    ranked = (
        select(
            Product.id.label("id"),
            Product.kind_code.label("kind"),
            score.label("score"),
            func.row_number().over(partition_by=Product.kind_code, order_by=(score.desc(), Product.id)).label("rank"),
            func.count().over(partition_by=Product.kind_code).label("kind_total"),
        )
        .where(Product.is_active.is_(True), search_predicate(q))
        .subquery()
    )
    rows = db.session.execute(
        select(ranked.c.id, ranked.c.kind, ranked.c.score, ranked.c.kind_total)
        .where(ranked.c.rank <= per_kind)
        .order_by(ranked.c.score.desc(), ranked.c.id)
    ).all()

    products = load_products([row.id for row in rows])
    groups: dict[str, SuggestionGroup] = {}
    for row in rows:  # best score first, so groups come out most relevant kind first
        kind = row.kind.value if hasattr(row.kind, "value") else str(row.kind)
        group = groups.setdefault(kind, SuggestionGroup(kind=kind, total=row.kind_total, items=[]))
        group.items.append(to_summary(products[row.id]))
    total = sum(group.total for group in groups.values())
    return SearchSuggestions(
        query=q,
        total=total,
        groups=list(groups.values()),
        did_you_mean=None if total else correction(q),
    )


_VOCABULARY = text(
    """
    SELECT word FROM (
        SELECT DISTINCT unnest(regexp_split_to_array(lower(name), '[^a-z0-9]+')) AS word
        FROM products WHERE is_active
    ) AS words
    WHERE length(word) >= 3 AND similarity(word, :word) >= :threshold AND word <> :word
    ORDER BY similarity(word, :word) DESC, word
    LIMIT 1
    """
)


def correction(q: str) -> str | None:
    """Replace each unknown word with the closest word in active product names, if one is close."""
    words = re.findall(r"[a-z0-9]+", q.lower())[:6]
    corrected: list[str] = []
    changed = False
    for word in words:
        best = (
            db.session.execute(_VOCABULARY, {"word": word, "threshold": CORRECTION_THRESHOLD}).scalar()
            if len(word) >= 3
            else None
        )
        corrected.append(best or word)
        changed = changed or best is not None
    return " ".join(corrected) if changed else None
