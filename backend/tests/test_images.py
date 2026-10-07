"""The photo pipeline: sources to WebP variants and product_images rows, idempotent, and served."""

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import ProductImage
from app.services.images import import_images

CPU, GPU = "FRG-CPU-R7-7800X3D", "FRG-GPU-MSI-4070S-V2X"


@pytest.fixture()
def dirs(app, tmp_path):
    source, media = tmp_path / "source", tmp_path / "media"
    source.mkdir()
    previous = app.config["MEDIA_ROOT"]
    app.config["MEDIA_ROOT"] = str(media)
    yield source, media
    app.config["MEDIA_ROOT"] = previous


def _photo(path, size=(2400, 1600), box=(600, 400, 1800, 1200), color=(30, 30, 30), mode="RGB"):
    """A white canvas with a dark 'product' in the middle, like a manufacturer's shot."""
    image = Image.new(mode, size, (255, 255, 255, 0) if mode == "RGBA" else "white")
    image.paste(Image.new(mode, (box[2] - box[0], box[3] - box[1]), color), box[:2])
    image.save(path)


def _rows(session, product):
    return session.scalars(
        select(ProductImage).where(ProductImage.product_id == product.id).order_by(ProductImage.position)
    ).all()


def test_sources_become_three_webp_widths_and_rows(session, dirs, product_by_sku):
    source, media = dirs
    _photo(source / f"{CPU}-1.jpg")
    _photo(source / f"{CPU}-2.png", size=(500, 500), box=(100, 100, 400, 400))
    report = import_images(source)
    assert (report.images, report.products) == (2, 1)

    first, second = _rows(session, product_by_sku(CPU))
    assert first.storage_key.startswith(f"{CPU}-1-") and second.position == 1
    assert first.alt_text == product_by_sku(CPU).name and second.alt_text.endswith("view 2")
    widths = {
        v: Image.open(media / "products" / f"{first.storage_key}-{v}.webp").width for v in ("thumb", "card", "full")
    }
    assert widths == {"thumb": 320, "card": 640, "full": 1280}
    assert (first.width, first.height) == Image.open(media / "products" / f"{first.storage_key}-full.webp").size
    small = Image.open(media / "products" / f"{second.storage_key}-full.webp")
    assert small.width < 400  # never enlarged (trimmed to the product, margin included)


def test_the_empty_margin_is_trimmed_and_transparency_flattened(session, dirs, product_by_sku):
    source, media = dirs
    _photo(source / f"{GPU}-1.png", size=(2000, 2000), box=(500, 900, 1500, 1100), mode="RGBA", color=(20, 20, 20, 255))
    import_images(source)
    [row] = _rows(session, product_by_sku(GPU))
    image = Image.open(media / "products" / f"{row.storage_key}-full.webp")
    assert image.width / image.height > 3  # the 1000 x 200 product, not the square canvas
    assert image.mode == "RGB" and image.getpixel((0, 0))[0] > 240  # white, not black, where it was transparent


def test_rerunning_is_idempotent_and_a_changed_photo_gets_a_new_url(session, dirs, product_by_sku):
    source, media = dirs
    _photo(source / f"{CPU}-1.jpg")
    import_images(source)
    [before] = _rows(session, product_by_sku(CPU))
    old_key = before.storage_key
    import_images(source)
    assert [r.storage_key for r in _rows(session, product_by_sku(CPU))] == [old_key]

    _photo(source / f"{CPU}-1.jpg", color=(200, 20, 20))
    import_images(source)
    [after] = _rows(session, product_by_sku(CPU))
    assert after.storage_key != old_key
    assert not (media / "products" / f"{old_key}-full.webp").exists()


def test_a_removed_source_removes_its_row(session, dirs, product_by_sku):
    source, _ = dirs
    _photo(source / f"{CPU}-1.jpg")
    _photo(source / f"{CPU}-2.jpg")
    import_images(source)
    (source / f"{CPU}-2.jpg").unlink()
    import_images(source)
    assert [r.position for r in _rows(session, product_by_sku(CPU))] == [0]


def test_unknown_skus_and_unreadable_files_are_reported(session, dirs):
    source, _ = dirs
    _photo(source / "FRG-NOT-A-PART-1.jpg")
    (source / f"{CPU}-1.jpg").write_bytes(b"not an image")
    (source / "notes.txt").write_text("ignored")
    report = import_images(source)
    assert report.unknown == ["FRG-NOT-A-PART-1.jpg"]
    assert report.unreadable == [f"{CPU}-1.jpg"]
    assert report.images == 0


def test_photos_reach_the_api_and_are_served(client, session, dirs, product_by_sku):
    source, _ = dirs
    _photo(source / f"{CPU}-1.jpg")
    import_images(source)
    image = client.get(f"/api/v1/products/{product_by_sku(CPU).slug}").get_json()["images"][0]
    served = client.get(image["card"])
    assert served.status_code == 200 and served.mimetype == "image/webp"
    assert client.get("/media/../app/config.py").status_code == 404
