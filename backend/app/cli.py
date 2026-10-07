"""Management commands: ``flask seed catalog``."""

from __future__ import annotations

import json
import re
from pathlib import Path

import click
from flask import Flask, current_app
from flask.cli import AppGroup
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

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
    User,
)
from .models.enums import UserRole
from .schemas.auth import RegisterRequest
from .security.passwords import hash_password

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
users_cli = AppGroup("users", help="Manage user accounts.")


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


@seed_cli.command("images")
@click.option("--source", type=click.Path(file_okay=False, path_type=Path), default=None)
def seed_images(source: Path | None) -> None:
    """Convert product photos (<SKU>-<n>.jpg|png|webp) to WebP variants and record them. Idempotent."""
    from .services.images import import_images

    folder = source or Path(current_app.config["IMAGE_SOURCE_DIR"])
    if not folder.is_dir():
        raise click.UsageError(f"No image folder at {folder}. See docs/IMAGE_SOURCES.md.")
    report = import_images(folder)
    click.echo(f"Images: {report.images} written for {report.products} products.")
    for name in report.unknown:
        click.echo(f"  skipped {name}: no product with that SKU", err=True)
    for name in report.unreadable:
        click.echo(f"  skipped {name}: not a readable image", err=True)


@users_cli.command("create-admin")
@click.option("--email", required=True)
@click.option("--first-name", required=True)
@click.option("--last-name", required=True)
@click.password_option(help="Prompted (hidden, confirmed) when omitted. Never pass it on a shared shell.")
def create_admin(email: str, first_name: str, last_name: str, password: str) -> None:
    """Create an administrator. The API never lets anyone self-assign the admin role."""
    try:
        data = RegisterRequest(email=email, password=password, first_name=first_name, last_name=last_name)
    except ValidationError as exc:
        problems = "; ".join(f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors())
        raise click.UsageError(problems) from exc
    db.session.add(
        User(
            email=str(data.email),
            password_hash=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            role=UserRole.ADMIN,
        )
    )
    try:
        db.session.commit()
    except IntegrityError as exc:
        db.session.rollback()
        raise click.ClickException(f"An account with email {data.email} already exists.") from exc
    click.echo(f"Admin {data.email} created.")


@seed_cli.command("demo")
@click.option("--yes", is_flag=True, help="Required under the production configuration.")
def seed_demo(yes: bool) -> None:
    """DEMO ONLY: reset orders, carts and builds; restore seeded stock; create the demo accounts
    and past orders. Idempotent."""
    from .demo import ADMIN, CUSTOMER, reset  # demo builds on this module's catalog loader

    if current_app.config.get("FORGE_ENV_NAME") == "production" and not yes:
        raise click.UsageError("This deletes all orders, carts and builds. Re-run with --yes to confirm.")
    result = reset()
    click.echo(f"Demo data reset: {result['orders']} past orders.")
    click.echo(f"  admin:    {ADMIN.email} / {ADMIN.password}")
    click.echo(f"  customer: {CUSTOMER.email} / {CUSTOMER.password}")


def register_cli(app: Flask) -> None:
    app.cli.add_command(seed_cli)
    app.cli.add_command(users_cli)
