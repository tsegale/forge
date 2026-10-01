"""Validation endpoints over the seeded catalog, and validation racing an item change."""

import threading
import time
import uuid

import pytest
from sqlalchemy import delete, select, text

from app.extensions import db
from app.models import Build, BuildItem, Product, User
from app.models.enums import BuildStatus
from app.security.passwords import hash_password
from app.security.tokens import issue_access_token
from app.services import compatibility as compatibility_service

CHECK = "/api/v1/compatibility/check"

# A complete, compatible AM5 build from the seed catalog.
GOOD_BUILD = [
    "FRG-CPU-R7-7800X3D",
    "FRG-MB-MSI-B650-TOMAHAWK",
    "FRG-RAM-CR-VEN-32-6000",
    "FRG-SSD-SAM-990PRO-2TB",
    "FRG-GPU-MSI-4070S-V2X",
    "FRG-PSU-CR-RM850E",
    "FRG-CASE-FD-NORTH",
    "FRG-COOL-TR-PA120SE",
]


def _items(product_by_sku, skus, swap=None):
    swap = swap or {}
    skus = [swap.get(s, s) for s in skus if swap.get(s, s) is not None]
    return [{"product_id": product_by_sku(s).id, "quantity": 1} for s in skus]


def _check(client, product_by_sku, swap=None, extra=()):
    items = _items(product_by_sku, GOOD_BUILD, swap) + [{"product_id": product_by_sku(s).id} for s in extra]
    response = client.post(CHECK, json={"items": items})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _codes(report, key="conflicts"):
    return [f["code"] for f in report[key]]


# --------------------------------------------------------------------- stateless check (seeded scenarios)


def test_reference_build_is_compatible_and_complete(client, product_by_sku):
    report = _check(client, product_by_sku)
    assert report["compatible"] and report["complete"]
    assert report["conflicts"] == [] and report["warnings"] == [] and report["missing_kinds"] == []
    assert report["power"] == {"sustained_w": 450, "peak_w": 670, "recommended_psu_w": 650}


@pytest.mark.parametrize(
    ("swap", "code"),
    [
        ({"FRG-CPU-R7-7800X3D": "FRG-CPU-I7-14700K"}, "SOCKET_MISMATCH"),
        ({"FRG-RAM-CR-VEN-32-6000": "FRG-RAM-CR-LPX-32-3200"}, "MEMORY_TYPE_MISMATCH"),
        ({"FRG-CASE-FD-NORTH": "FRG-CASE-CM-NR200P"}, "FORM_FACTOR_UNSUPPORTED"),  # ATX board, ITX case
        (
            {"FRG-GPU-MSI-4070S-V2X": "FRG-GPU-ASUS-4080S-TUF", "FRG-CASE-FD-NORTH": "FRG-CASE-CM-NR200P"},
            "GPU_TOO_LONG",
        ),
        ({"FRG-COOL-TR-PA120SE": "FRG-COOL-NOC-NHD15", "FRG-CASE-FD-NORTH": "FRG-CASE-CM-NR200P"}, "COOLER_TOO_TALL"),
        (
            {"FRG-COOL-TR-PA120SE": "FRG-COOL-AR-LF3-360", "FRG-CASE-FD-NORTH": "FRG-CASE-NZ-H5FLOW"},
            "RADIATOR_UNSUPPORTED",
        ),
        (
            {"FRG-PSU-CR-RM850E": "FRG-PSU-CR-RM850E", "FRG-CASE-FD-NORTH": "FRG-CASE-CM-NR200P"},
            "PSU_FORM_FACTOR_MISMATCH",
        ),
        (
            {
                "FRG-CPU-R7-7800X3D": "FRG-CPU-U7-265K",
                "FRG-MB-MSI-B650-TOMAHAWK": "FRG-MB-MSI-Z890-A",
                "FRG-COOL-TR-PA120SE": "FRG-COOL-DC-AK400",
            },
            "COOLER_SOCKET_UNSUPPORTED",
        ),
        ({"FRG-GPU-MSI-4070S-V2X": "FRG-GPU-NV-5090-FE", "FRG-PSU-CR-RM850E": "FRG-PSU-CM-MWE550"}, "PSU_INSUFFICIENT"),
    ],
)
def test_known_bad_combinations(client, product_by_sku, swap, code):
    report = _check(client, product_by_sku, swap)
    assert code in _codes(report)
    assert report["compatible"] is False


def test_sfx_psu_in_atx_case_is_only_a_warning(client, product_by_sku):
    report = _check(client, product_by_sku, {"FRG-PSU-CR-RM850E": "FRG-PSU-CR-SF750"})
    assert report["compatible"]
    assert {"PSU_NEEDS_BRACKET", "PSU_NEEDS_ADAPTER"} <= set(_codes(report, "warnings"))


def test_mixed_memory_kits_warn(client, product_by_sku):
    report = _check(client, product_by_sku, extra=["FRG-RAM-GS-TZ5-32-6000"])
    assert report["compatible"] and "MIXED_MEMORY_KITS" in _codes(report, "warnings")


def test_igpu_less_cpu_without_gpu_is_incomplete_not_incompatible(client, product_by_sku):
    swap = {
        "FRG-CPU-R7-7800X3D": "FRG-CPU-I5-12400F",
        "FRG-MB-MSI-B650-TOMAHAWK": "FRG-MB-MSI-Z790-A",
        "FRG-GPU-MSI-4070S-V2X": None,
        "FRG-COOL-TR-PA120SE": None,
    }
    report = _check(client, product_by_sku, swap)
    assert report["compatible"] and not report["complete"]
    assert report["missing_kinds"] == ["gpu"]  # the 12400F ships with a cooler, so none is missing


def test_cpu_without_bundled_cooler_needs_one(client, product_by_sku):
    report = _check(client, product_by_sku, {"FRG-COOL-TR-PA120SE": None})
    assert report["missing_kinds"] == ["cooler"]


def test_empty_list_reports_every_required_kind(client):
    report = client.post(CHECK, json={"items": []}).get_json()
    assert report["missing_kinds"] == ["cpu", "motherboard", "memory", "storage", "psu", "case"]


def test_unknown_products_are_422(client):
    response = client.post(CHECK, json={"items": [{"product_id": 999_999}]})
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["field"] == "items.0.product_id"


# --------------------------------------------------------------------- saved builds


@pytest.fixture()
def owner(make_user, auth_headers):
    user = make_user()
    return user, auth_headers(user)


def _saved_build(session, user, product_by_sku, skus, status=BuildStatus.DRAFT):
    build = Build(user_id=user.id, name="Saved")
    for sku in skus:
        build.items.append(BuildItem.for_product(product_by_sku(sku)))
    session.add(build)
    session.flush()
    build.status = status  # after the items: an ordered build's items are locked
    session.commit()  # requests share this session; see tests/test_builds_api.py::_set_status
    return build


def _validate(client, headers, build):
    return client.post(f"/api/v1/builds/{build.id}/validate", headers=headers)


def test_compatible_complete_build_becomes_validated(client, session, owner, product_by_sku):
    build = _saved_build(session, owner[0], product_by_sku, GOOD_BUILD)
    body = _validate(client, owner[1], build).get_json()
    assert body["status"] == "validated" and body["compatible"] and body["complete"]


def test_incomplete_build_stays_draft(client, session, owner, product_by_sku):
    build = _saved_build(session, owner[0], product_by_sku, GOOD_BUILD[:-1], status=BuildStatus.VALIDATED)
    body = _validate(client, owner[1], build).get_json()
    assert body["status"] == "draft" and body["compatible"] and body["missing_kinds"] == ["cooler"]


def test_incompatible_build_stays_draft(client, session, owner, product_by_sku):
    skus = [s if s != "FRG-RAM-CR-VEN-32-6000" else "FRG-RAM-CR-LPX-32-3200" for s in GOOD_BUILD]
    body = _validate(client, owner[1], _saved_build(session, owner[0], product_by_sku, skus)).get_json()
    assert body["status"] == "draft" and not body["compatible"]


def test_ordered_build_keeps_its_status(client, session, owner, product_by_sku):
    build = _saved_build(session, owner[0], product_by_sku, GOOD_BUILD[:2], status=BuildStatus.ORDERED)
    assert _validate(client, owner[1], build).get_json()["status"] == "ordered"


def test_other_users_builds_are_404(client, session, owner, product_by_sku, make_user, auth_headers):
    build = _saved_build(session, owner[0], product_by_sku, GOOD_BUILD)
    assert _validate(client, auth_headers(make_user()), build).status_code == 404


# --------------------------------------------------------------------- validation racing an item change


def _lock_waiters(conn) -> int:
    conn.execute(text("SELECT pg_stat_clear_snapshot()"))
    return conn.execute(
        text(
            "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() "
            "AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()"
        )
    ).scalar_one()


def test_item_added_during_validation_leaves_the_build_draft(app, monkeypatch):
    """Validation is paused after reading the items and before writing the status. An item is added
    meanwhile. With the build row locked first, the add waits, then resets the status: draft. If
    validation did not lock, the add would commit first and validation would then mark a build it
    never saw as validated."""
    email = f"race-{uuid.uuid4().hex[:8]}@example.com"
    with app.app_context():
        user = User(email=email, password_hash=hash_password("x" * 12), first_name="R", last_name="C")
        db.session.add(user)
        db.session.flush()
        by_sku = {p.sku: p for p in db.session.scalars(select(Product))}
        build = Build(user_id=user.id, name="Race")
        for sku in GOOD_BUILD:
            build.items.append(BuildItem.for_product(by_sku[sku]))
        db.session.add(build)
        db.session.commit()
        build_id, headers = build.id, {"Authorization": f"Bearer {issue_access_token(user.id, 'customer').token}"}
        extra_drive = by_sku["FRG-SSD-WD-SN850X-1TB"].id

    items_read, release = threading.Event(), threading.Event()
    real_evaluate = compatibility_service.evaluate

    def paused_evaluate(*args, **kwargs):
        items_read.set()
        assert release.wait(timeout=30)
        return real_evaluate(*args, **kwargs)

    monkeypatch.setattr(compatibility_service, "evaluate", paused_evaluate)
    responses: dict[str, int] = {}

    def run(name, method, path, **kwargs):
        responses[name] = getattr(app.test_client(), method)(path, headers=headers, **kwargs).status_code

    try:
        validator = threading.Thread(target=run, args=("validate", "post", f"/api/v1/builds/{build_id}/validate"))
        validator.start()
        assert items_read.wait(timeout=30)
        adder = threading.Thread(
            target=run,
            args=("add", "post", f"/api/v1/builds/{build_id}/items"),
            kwargs={"json": {"product_id": extra_drive}},
        )
        adder.start()
        with app.app_context(), db.engine.connect() as watcher:
            deadline = time.monotonic() + 10
            while adder.is_alive() and _lock_waiters(watcher) == 0 and time.monotonic() < deadline:
                time.sleep(0.02)
        release.set()
        for t in (validator, adder):
            t.join(timeout=30)
            assert not t.is_alive()

        assert responses == {"validate": 200, "add": 201}
        with app.app_context():
            final = db.session.get(Build, build_id)
            assert len(final.items) == len(GOOD_BUILD) + 1
            assert final.status is BuildStatus.DRAFT
    finally:
        release.set()
        with app.app_context():
            db.session.execute(delete(User).where(User.email == email))
            db.session.commit()
