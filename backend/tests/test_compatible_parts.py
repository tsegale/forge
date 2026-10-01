"""Compatible-parts filtering: the SQL filters must agree with the engine, part for part."""

import pytest
from sqlalchemy import select

from app.compat import BuildContext, Part, evaluate
from app.compat.context import SINGLE_SLOT_KINDS
from app.models import Product
from app.models.enums import KindCode

PRODUCTS = "/api/v1/products"

# Reference builds from the seed catalog, each conflict-free, chosen to make filters bite:
# full slots, small cases, SFX power, DDR4, partial builds and an empty build.
BASES = {
    "atx_am5": [
        "FRG-CPU-R7-7800X3D",
        "FRG-MB-MSI-B650-TOMAHAWK",
        "FRG-RAM-CR-VEN-32-6000",
        "FRG-SSD-SAM-990PRO-2TB",
        "FRG-GPU-MSI-4070S-V2X",
        "FRG-PSU-CR-RM850E",
        "FRG-CASE-FD-NORTH",
        "FRG-COOL-TR-PA120SE",
    ],
    "itx_full_slots": [
        "FRG-CPU-R7-7800X3D",
        "FRG-MB-ASUS-B650E-I",
        "FRG-RAM-CR-VEN-32-6000",
        "FRG-SSD-SAM-990PRO-2TB",
        "FRG-SSD-WD-SN850X-1TB",
        "FRG-GPU-ASUS-4060-DUAL",
        "FRG-PSU-CR-SF750",
        "FRG-CASE-CM-NR200P",
        "FRG-COOL-NOC-L9A-AM5",
    ],
    "intel_ddr4_no_case": [
        "FRG-CPU-I7-14700K",
        "FRG-MB-ASUS-B760-PLUS-D4",
        "FRG-RAM-CR-LPX-32-3200",
        "FRG-SSD-CRU-MX500-1TB",
        "FRG-HDD-SEA-BC-2TB",
        "FRG-PSU-CM-MWE550",
    ],
    "small_psu_only_cpu": ["FRG-CPU-R7-9800X3D", "FRG-PSU-CM-MWE550"],
    "case_only": ["FRG-CASE-LL-A3"],
    "aio_case": ["FRG-CASE-NZ-H5FLOW", "FRG-COOL-NZ-KRAKEN240"],  # 240 mm radiator, 280 mm mount
    "empty": [],
}
KINDS = [k for k in KindCode if k is not KindCode.ACCESSORY]


def _ids(product_by_sku, skus):
    return [product_by_sku(s).id for s in skus]


def _listed(client, kind, ids):
    query = f"{PRODUCTS}?kind={kind.value}&limit=100" + (
        f"&compatible_with={','.join(map(str, ids))}" if ids else "&compatible_with="
    )
    response = client.get(query)
    assert response.status_code == 200, response.get_json()
    body = response.get_json()
    assert body["next_cursor"] is None
    return {i["id"]: i for i in body["items"]}


@pytest.mark.parametrize("base_name", list(BASES))
@pytest.mark.parametrize("kind", KINDS, ids=[k.value for k in KINDS])
def test_sql_filter_agrees_with_the_engine(client, session, product_by_sku, base_name, kind):
    parts = [product_by_sku(s) for s in BASES[base_name]]
    ctx = BuildContext(Part(p) for p in parts)
    assert evaluate(ctx, []).conflicts == [], f"{base_name} must be conflict-free"
    base = ctx.without_kind(kind) if kind in SINGLE_SLOT_KINDS else ctx

    candidates = session.scalars(select(Product).where(Product.kind_code == kind.value, Product.is_active)).all()
    expected = {p.id for p in candidates if not evaluate(base.with_candidate(p), []).conflicts}
    listed = _listed(client, kind, [p.id for p in parts])

    assert set(listed) == expected, (
        f"{kind.value} vs {base_name}: SQL-only {sorted(set(listed) - expected)}, "
        f"engine-only {sorted(expected - set(listed))}"
    )


def test_filters_actually_exclude_something(client, product_by_sku):
    """Guards the parity test against passing vacuously."""
    itx = _ids(product_by_sku, BASES["itx_full_slots"])
    assert product_by_sku("FRG-GPU-ASUS-4080S-TUF").id not in _listed(client, KindCode.GPU, itx)
    assert product_by_sku("FRG-SSD-WD-SN850X-1TB").id not in _listed(client, KindCode.STORAGE, itx)  # M.2 full
    assert product_by_sku("FRG-SSD-CRU-MX500-1TB").id in _listed(client, KindCode.STORAGE, itx)  # SATA port free
    assert product_by_sku("FRG-PSU-CR-RM850E").id not in _listed(client, KindCode.PSU, itx)  # ATX in SFX bay


def test_single_slot_candidates_replace_the_current_part(client, product_by_sku):
    am5 = _ids(product_by_sku, BASES["atx_am5"])
    cpus = _listed(client, KindCode.CPU, am5)
    assert product_by_sku("FRG-CPU-R9-7950X").id in cpus  # swapping one AM5 CPU for another
    assert product_by_sku("FRG-CPU-I9-14900K").id not in cpus


def test_cpus_without_integrated_graphics_stay_listed_for_a_build_without_a_gpu(client, product_by_sku):
    board = _ids(product_by_sku, ["FRG-MB-MSI-Z790-A"])
    assert product_by_sku("FRG-CPU-I5-12400F").id in _listed(client, KindCode.CPU, board)


def test_warnings_are_returned_not_filtered(client, product_by_sku):
    am5 = _ids(product_by_sku, BASES["atx_am5"])
    memory = _listed(client, KindCode.MEMORY, am5)
    assert memory[product_by_sku("FRG-RAM-GS-TZ5-32-6000").id]["compatibility_warnings"] == ["MIXED_MEMORY_KITS"]
    assert memory[product_by_sku("FRG-RAM-CR-VEN-32-6000").id]["compatibility_warnings"] == []  # same kit again
    psus = _listed(client, KindCode.PSU, am5)
    assert "PSU_NEEDS_BRACKET" in psus[product_by_sku("FRG-PSU-CR-SF750").id]["compatibility_warnings"]


def test_plain_listing_has_no_compatibility_field_values(client):
    assert all(i["compatibility_warnings"] is None for i in client.get(f"{PRODUCTS}?kind=cpu").get_json()["items"])


@pytest.mark.parametrize(
    ("query", "kind_of_error"),
    [("compatible_with=1", "kind_required"), ("kind=cpu&compatible_with=999999", "product_unknown")],
)
def test_invalid_compatible_with_is_422(client, query, kind_of_error):
    response = client.get(f"{PRODUCTS}?{query}")
    assert response.status_code == 422
    assert response.get_json()["error"]["details"][0]["type"] == kind_of_error
