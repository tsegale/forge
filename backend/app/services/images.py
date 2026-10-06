"""Product photos: source files to WebP variants and product_images rows (``flask seed images``).

Sources are named ``<SKU>-<n>.<ext>`` (docs/IMAGE_SOURCES.md), n from 1, in IMAGE_SOURCE_DIR.
Each becomes three WebP files under MEDIA_ROOT/products (thumb 320, card 640, full 1280 pixels
wide, never enlarged), after correcting the camera rotation, flattening transparency onto white
and trimming the empty margin, so every photo fills the storefront's 4:3 frame the same way.
Re-running is safe: rows are upserted by (product, position), and a product's rows for photos
no longer in the source folder are removed. Storage keys carry a hash of the source file, so a
changed photo gets a new URL (cacheable forever) and the old files are deleted.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from flask import current_app
from PIL import Image, ImageChops, ImageOps
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from ..extensions import db
from ..models import Product, ProductImage
from .media import VARIANTS, variant_name

SOURCE = re.compile(r"^(?P<sku>[A-Za-z0-9][A-Za-z0-9-]*?)-(?P<n>[1-9][0-9]?)\.(?:jpe?g|png|webp)$", re.IGNORECASE)
WEBP_QUALITY = 82
TRIM_THRESHOLD = 12  # how far from white still counts as background (0-255)
MARGIN = 0.04  # breathing room kept around the trimmed product, as a share of its size


@dataclass
class ImportReport:
    images: int = 0
    products: int = 0
    unknown: list[str] = field(default_factory=list)
    unreadable: list[str] = field(default_factory=list)


def media_root() -> Path:
    return Path(current_app.config["MEDIA_ROOT"])


def prepare(path: Path) -> Image.Image:
    """Upright, opaque on white, cropped to the product with a small margin."""
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened)
        image.load()
    if image.mode in ("RGBA", "LA", "P"):
        image = image.convert("RGBA")
        canvas = Image.new("RGB", image.size, "white")
        canvas.paste(image, mask=image.getchannel("A"))
        image = canvas
    else:
        image = image.convert("RGB")
    background = Image.new("RGB", image.size, "white")
    diff = ImageChops.difference(image, background).convert("L").point(lambda v: 255 if v > TRIM_THRESHOLD else 0)
    box = diff.getbbox()
    if box:
        left, top, right, bottom = box
        pad_x, pad_y = int((right - left) * MARGIN), int((bottom - top) * MARGIN)
        image = image.crop(
            (
                max(left - pad_x, 0),
                max(top - pad_y, 0),
                min(right + pad_x, image.width),
                min(bottom + pad_y, image.height),
            )
        )
    return image


def write_variants(image: Image.Image, storage_key: str) -> tuple[int, int]:
    """Write the three widths; returns the full variant's size."""
    folder = media_root() / "products"
    folder.mkdir(parents=True, exist_ok=True)
    full_size = image.size
    for variant, width in VARIANTS.items():
        scaled = image
        if image.width > width:
            scaled = image.resize((width, round(image.height * width / image.width)), Image.Resampling.LANCZOS)
        scaled.save(folder / variant_name(storage_key, variant), "WEBP", quality=WEBP_QUALITY, method=6)
        if variant == "full":
            full_size = scaled.size
    return full_size


def import_images(source: Path) -> ImportReport:
    report = ImportReport()
    found: dict[str, list[tuple[int, Path]]] = {}
    for path in sorted(source.iterdir()) if source.is_dir() else []:
        match = SOURCE.match(path.name)
        if match:
            found.setdefault(match["sku"].upper(), []).append((int(match["n"]), path))

    products = {p.sku: p for p in db.session.scalars(select(Product).where(Product.sku.in_(list(found))))}
    stale: list[str] = []
    for sku, files in sorted(found.items()):
        product = products.get(sku)
        if product is None:
            report.unknown.extend(path.name for _, path in files)
            continue
        positions = []
        for n, path in sorted(files):
            try:
                image = prepare(path)
            except (OSError, ValueError):
                report.unreadable.append(path.name)
                continue
            # The content hash makes a replaced photo a new URL, so browsers and nginx can cache forever.
            key = f"{sku}-{n}-{hashlib.sha256(path.read_bytes()).hexdigest()[:10]}"
            previous = db.session.scalar(
                select(ProductImage.storage_key).where(
                    ProductImage.product_id == product.id, ProductImage.position == n - 1
                )
            )
            width, height = write_variants(image, key)
            if previous and previous != key:
                stale.append(previous)
            alt = product.name if n == 1 else f"{product.name}, view {n}"
            stmt = insert(ProductImage).values(
                product_id=product.id, position=n - 1, storage_key=key, alt_text=alt, width=width, height=height
            )
            db.session.execute(
                stmt.on_conflict_do_update(
                    constraint="uq_product_images_product_position",
                    set_={"storage_key": key, "alt_text": alt, "width": width, "height": height},
                )
            )
            positions.append(n - 1)
            report.images += 1
        removed = db.session.scalars(
            delete(ProductImage)
            .where(ProductImage.product_id == product.id, ProductImage.position.not_in(positions))
            .returning(ProductImage.storage_key)
        ).all()
        stale.extend(removed)
        report.products += 1
    db.session.commit()
    for key in stale:  # only once the rows no longer point at them
        for variant in VARIANTS:
            (media_root() / "products" / variant_name(key, variant)).unlink(missing_ok=True)
    return report
