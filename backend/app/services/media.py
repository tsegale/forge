"""Public URLs for product photos. The files are written by the image pipeline (`flask seed images`)."""

from __future__ import annotations

from flask import current_app

from ..models import ProductImage
from ..schemas.catalog import ProductImageResponse

VARIANTS = {"thumb": 320, "card": 640, "full": 1280}


def variant_name(storage_key: str, variant: str) -> str:
    return f"{storage_key}-{variant}.webp"


def image_response(image: ProductImage) -> ProductImageResponse:
    base = f"{current_app.config['MEDIA_URL']}/products"
    urls = {variant: f"{base}/{variant_name(image.storage_key, variant)}" for variant in VARIANTS}
    return ProductImageResponse(**urls, alt=image.alt_text, width=image.width, height=image.height)
