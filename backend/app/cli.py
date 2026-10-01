"""Management commands: ``flask seed catalog``."""

from __future__ import annotations

import json
import re
from pathlib import Path

import click
from flask import Flask
from flask.cli import AppGroup
from sqlalchemy import select

from .extensions import db
from .models import (
    AccessoryProduct,
    BoardFormFactor,
    Brand,
    CaseProduct,
    Category,
    CoolerProduct,
    CpuProduct,
    GpuProduct,
    Inventory,
    MemoryProduct,
    MotherboardProduct,
    Product,
    PsuProduct,
    Socket,
    StorageProduct,
)

KIND_TO_CLASS: dict[str, type[Product]] = {
    "cpu": CpuProduct,
    "motherboard": MotherboardProduct,
    "memory": MemoryProduct,
    "gpu": GpuProduct,
    "storage": StorageProduct,
    "psu": PsuProduct,
    "case": CaseProduct,
    "cooler": CoolerProduct,
    "accessory": AccessoryProduct,
}
DEFAULT_SEED = Path(__file__).resolve().parent.parent / "seed" / "catalog.json"

seed_cli = AppGroup("seed", help="Load seed data.")


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def _get_or_create_brand(name: str, cache: dict[str, Brand]) -> Brand:
    if name not in cache:
        brand = db.session.scalar(select(Brand).where(Brand.name == name))
        if brand is None:
            brand = Brand(name=name, slug=slugify(name))
            db.session.add(brand)
        cache[name] = brand
    return cache[name]


def _upsert_categories(nodes: list[dict], parent: Category | None, out: dict[str, Category]) -> None:
    for node in nodes:
        cat = db.session.scalar(select(Category).where(Category.slug == node["slug"]))
        if cat is None:
            cat = Category(slug=node["slug"])
            db.session.add(cat)
        cat.name, cat.parent, cat.kind_code = node["name"], parent, node.get("kind")
        out[cat.slug] = cat
        _upsert_categories(node.get("children", []), cat, out)


def load_catalog(path: Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    categories: dict[str, Category] = {}
    _upsert_categories(data["categories"], None, categories)
    db.session.flush()

    sockets = {s.code: s for s in db.session.scalars(select(Socket))}
    form_factors = {f.code: f for f in db.session.scalars(select(BoardFormFactor))}
    brands: dict[str, Brand] = {}
    created = updated = 0

    for row in data["products"]:
        cls = KIND_TO_CLASS[row["kind"]]
        specs = dict(row.get("specs", {}))
        if cls is CaseProduct:
            specs["supported_form_factors"] = [form_factors[c] for c in specs.pop("supported_form_factors")]
        if cls is CoolerProduct:
            specs["supported_sockets"] = [sockets[c] for c in specs.pop("supported_sockets")]

        brand = _get_or_create_brand(row["brand"], brands)
        category = categories[row["category"]]
        product = db.session.scalar(select(Product).where(Product.sku == row["sku"]))
        with db.session.no_autoflush:  # populate fully before the INSERT is emitted
            if product is None:
                product = cls(sku=row["sku"])
                db.session.add(product)
                created += 1
            else:
                updated += 1
            product.name = row["name"]
            product.slug = slugify(row["name"])
            product.brand = brand
            product.category = category
            product.category_id = category.id
            product.price_cents = round(row["price"] * 100)
            product.description = row.get("description")
            product.attributes = row.get("attributes", {})
            for key, value in specs.items():
                setattr(product, key, value)
        db.session.flush()  # inventory row is created by trigger on insert

        inventory = db.session.get(Inventory, product.id)
        if inventory.quantity_on_hand != row["stock"]:
            inventory.quantity_on_hand = row["stock"]

    db.session.commit()
    return created, updated


@seed_cli.command("catalog")
@click.option("--path", type=click.Path(exists=True, path_type=Path), default=DEFAULT_SEED)
def seed_catalog(path: Path) -> None:
    """Idempotently upsert categories, brands, products and stock (keyed by SKU)."""
    created, updated = load_catalog(path)
    click.echo(f"Catalog seeded: {created} created, {updated} updated.")


def register_cli(app: Flask) -> None:
    app.cli.add_command(seed_cli)
