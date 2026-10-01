"""Physical fit rules. No database."""

import pytest

from app.compat import evaluate
from app.models.enums import PsuFormFactor
from tests.compat_factories import REQUIRED, case, ctx, full_build, gpu, motherboard, psu


def _findings(*products):
    return {f.code: f for f in evaluate(ctx(*products), REQUIRED).findings}


def test_board_form_factor_must_be_supported():
    finding = _findings(motherboard(form_factor_code="ATX"), case(form_factors=("Mini-ITX",)))[
        "FORM_FACTOR_UNSUPPORTED"
    ]
    assert finding.severity == "conflict"
    assert finding.details == {"motherboard_form_factor": "ATX", "case_form_factors": ["Mini-ITX"]}


def test_smaller_boards_fit_larger_cases():
    assert _findings(motherboard(form_factor_code="Mini-ITX"), case()) == {}


def test_gpu_longer_than_clearance():
    finding = _findings(gpu(length_mm=361), case(max_gpu_length_mm=360))["GPU_TOO_LONG"]
    assert finding.details == {"gpu_length_mm": 361, "case_max_gpu_length_mm": 360}


def test_gpu_exactly_at_clearance_fits():
    assert _findings(gpu(length_mm=360), case(max_gpu_length_mm=360)) == {}


def test_each_long_gpu_is_reported():
    long_a, long_b = gpu(length_mm=400), gpu(length_mm=410)
    report = evaluate(ctx(long_a, long_b, case(max_gpu_length_mm=360)), REQUIRED)
    assert [f.code for f in report.conflicts] == ["GPU_TOO_LONG", "GPU_TOO_LONG"]


@pytest.mark.parametrize(
    ("bay", "unit", "expected"),
    [
        (PsuFormFactor.ATX, PsuFormFactor.ATX, None),
        (PsuFormFactor.ATX, PsuFormFactor.SFX, ("warning", "PSU_NEEDS_BRACKET")),
        (PsuFormFactor.ATX, PsuFormFactor.SFX_L, ("warning", "PSU_NEEDS_BRACKET")),
        (PsuFormFactor.SFX, PsuFormFactor.SFX, None),
        (PsuFormFactor.SFX, PsuFormFactor.SFX_L, ("warning", "PSU_SFX_L_CLEARANCE")),
        (PsuFormFactor.SFX, PsuFormFactor.ATX, ("conflict", "PSU_FORM_FACTOR_MISMATCH")),
        (PsuFormFactor.SFX_L, PsuFormFactor.SFX, None),
        (PsuFormFactor.SFX_L, PsuFormFactor.ATX, ("conflict", "PSU_FORM_FACTOR_MISMATCH")),
    ],
)
def test_psu_bay_matrix(bay, unit, expected):
    findings = list(evaluate(ctx(psu(form_factor=unit), case(psu_form_factor=bay)), REQUIRED).findings)
    assert [(f.severity, f.code) for f in findings] == ([expected] if expected else [])


def test_reference_build_fits():
    assert evaluate(ctx(*full_build()), REQUIRED).findings == ()
