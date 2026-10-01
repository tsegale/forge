"""Cooler rules. No database."""

from app.compat import evaluate
from app.models.enums import CoolerType
from tests.compat_factories import REQUIRED, case, cooler, cpu, ctx


def _findings(*products):
    return {f.code: f for f in evaluate(ctx(*products), REQUIRED).findings}


def _aio(radiator_mm):
    return cooler(cooler_type=CoolerType.AIO, height_mm=None, radiator_mm=radiator_mm)


def test_cooler_without_mounting_for_the_socket():
    finding = _findings(cpu(socket_code="LGA1851"), cooler(sockets=("AM4", "AM5")))["COOLER_SOCKET_UNSUPPORTED"]
    assert finding.severity == "conflict"
    assert finding.details == {"cpu_socket": "LGA1851", "cooler_sockets": ["AM4", "AM5"]}


def test_air_cooler_taller_than_clearance():
    finding = _findings(cooler(height_mm=171), case(max_cooler_height_mm=170))["COOLER_TOO_TALL"]
    assert finding.details == {"cooler_height_mm": 171, "case_max_cooler_height_mm": 170}


def test_air_cooler_at_clearance_fits():
    assert _findings(cooler(height_mm=170), case(max_cooler_height_mm=170)) == {}


def test_radiator_larger_than_mount():
    finding = _findings(_aio(360), case(max_radiator_mm=280))["RADIATOR_UNSUPPORTED"]
    assert finding.details == {"radiator_mm": 360, "case_max_radiator_mm": 280}


def test_case_without_radiator_support_rejects_any_aio():
    finding = _findings(_aio(120), case(max_radiator_mm=None))["RADIATOR_UNSUPPORTED"]
    assert "has no radiator mount" in finding.message


def test_aio_ignores_tower_height_and_air_ignores_radiators():
    assert _findings(_aio(240), case(max_cooler_height_mm=40, max_radiator_mm=240)) == {}
    assert _findings(cooler(height_mm=150), case(max_radiator_mm=None)) == {}


def test_underrated_cooler_warns():
    finding = _findings(cpu(max_power_w=253), cooler(tdp_rating_w=220))["COOLER_UNDERRATED"]
    assert finding.severity == "warning"
    assert finding.details == {"cooler_tdp_rating_w": 220, "cpu_max_power_w": 253}


def test_unrated_cooler_does_not_warn():
    assert _findings(cpu(max_power_w=253), cooler(tdp_rating_w=None)) == {}
