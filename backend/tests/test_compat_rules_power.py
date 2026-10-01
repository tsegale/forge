"""Power budget and PSU rules. No database."""

import pytest

from app.compat import evaluate
from app.compat.power import estimate
from app.models.enums import PsuAtxVersion, StorageFormFactor, StorageInterface
from tests.compat_factories import REQUIRED, ctx, full_build, gpu, psu, storage

RTX_5090 = {"tdp_w": 575, "recommended_psu_w": 1000, "power_connectors": "1x 16-pin 12V-2x6"}


def _findings(*products):
    return {f.code: f for f in evaluate(ctx(*products), REQUIRED).findings}


def test_reference_build_budget():
    """CPU 162 + GPU 220 + base 50 + 2 DDR5 modules 10 + NVMe 8 = 450 W sustained; the GPU adds its
    board power again at peak; the GPU vendor's 650 W recommendation is the binding constraint."""
    power = estimate(ctx(*full_build()))
    assert (power.sustained_w, power.peak_w, power.recommended_psu_w) == (450, 670, 650)


def test_estimate_is_part_of_every_report():
    assert evaluate(ctx(), REQUIRED).power.sustained_w == 50


@pytest.mark.parametrize(
    ("drive", "watts"),
    [
        (storage(), 8),
        (storage(interface=StorageInterface.SATA, form_factor=StorageFormFactor.INCH_2_5, pcie_gen=None), 4),
        (storage(interface=StorageInterface.SATA, form_factor=StorageFormFactor.INCH_3_5, pcie_gen=None), 10),
    ],
)
def test_drive_allowances(drive, watts):
    assert estimate(ctx(drive)).sustained_w == 50 + watts


def test_undersized_psu_is_a_conflict():
    finding = _findings(*full_build(psu=psu(wattage_w=400)))["PSU_INSUFFICIENT"]
    assert finding.severity == "conflict"
    assert finding.details == {"sustained_w": 450, "psu_w": 400}


def test_psu_above_80_percent_load_warns_with_a_recommendation():
    findings = _findings(*full_build(psu=psu(wattage_w=550)))
    assert findings["PSU_HIGH_LOAD"].details == {"sustained_w": 450, "psu_w": 550, "recommended_psu_w": 650}
    assert "PSU_INSUFFICIENT" not in findings


def test_below_gpu_vendor_recommendation_warns():
    findings = _findings(*full_build(psu=psu(wattage_w=600)))
    assert findings["PSU_BELOW_GPU_RECOMMENDATION"].details == {"psu_w": 600, "gpu_recommended_psu_w": 650}


@pytest.mark.parametrize(
    ("version", "expect_warning"),
    [(PsuAtxVersion.V2, True), (PsuAtxVersion.V3_0, False), (PsuAtxVersion.V3_1, False)],
)
def test_transient_tolerance_depends_on_atx_version(version, expect_warning):
    """RTX 5090 build: 805 W sustained, 1380 W peak. A 1000 W ATX 3.x unit rides through 2000 W
    excursions by specification; an ATX 2.x unit is assumed to manage 1300 W."""
    findings = _findings(*full_build(gpu=gpu(**RTX_5090), psu=psu(wattage_w=1000, atx_version=version)))
    assert ("PSU_TRANSIENT_RISK" in findings) is expect_warning
    if expect_warning:
        assert findings["PSU_TRANSIENT_RISK"].details["peak_w"] == 1380


@pytest.mark.parametrize("connector", ["1x 16-pin 12V-2x6", "1x 16-pin 12VHPWR"])
def test_16_pin_card_without_native_cable_needs_an_adapter(connector):
    findings = _findings(*full_build(gpu=gpu(power_connectors=connector), psu=psu(has_12v_2x6=False)))
    assert findings["PSU_NEEDS_ADAPTER"].severity == "warning"


def test_8_pin_card_needs_no_adapter():
    assert "PSU_NEEDS_ADAPTER" not in _findings(*full_build(psu=psu(has_12v_2x6=False)))


def test_no_psu_means_no_power_findings():
    assert _findings(*full_build(psu=None)) == {}


def test_dual_gpus_count_twice():
    card = gpu()
    power = estimate(ctx(card, quantities={card.id: 2}))
    assert power.sustained_w == 50 + 2 * 220
