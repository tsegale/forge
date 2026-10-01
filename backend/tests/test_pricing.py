"""VAT-inclusive totals: exact integer rounding and total = subtotal + tax + shipping, always."""

from fractions import Fraction

import pytest

from app.services.pricing import compute, included_vat, round_half_up

VAT = 1500  # 15%
SHIP, FREE = 15_000, 500_000


def _totals(goods):
    return compute(goods, vat_rate_bps=VAT, flat_cents=SHIP, free_threshold_cents=FREE)


def _exact_vat(gross):
    """Reference: exact rational VAT, rounded half up."""
    exact = Fraction(gross * 15, 115)
    return int(exact) + (1 if exact - int(exact) >= Fraction(1, 2) else 0)


@pytest.mark.parametrize(
    ("gross", "vat"),
    [
        # At 15% the VAT is gross x 3/23, so a fraction of exactly one half never occurs.
        # These are the nearest cases on each side: 11/23 (0.478) and 12/23 (0.522).
        (19, 2),  # 57/23 = 2.478 -> 2
        (4, 1),  # 12/23 = 0.522 -> 1
        (11_499, 1_500),  # 34497/23 = 1499.87
        (100_000, 13_043),  # 300000/23 = 13043.478 -> 13043
        (100_004, 13_044),  # 300012/23 = 13043.98 -> 13044
    ],
)
def test_included_vat_rounds_to_the_nearest_cent(gross, vat):
    assert included_vat(gross, VAT) == vat == _exact_vat(gross)


def test_vat_matches_exact_arithmetic_across_a_range():
    for gross in range(0, 50_000, 7):
        assert included_vat(gross, VAT) == _exact_vat(gross)


def test_round_half_up_handles_true_halves():
    assert (round_half_up(1, 2), round_half_up(3, 2), round_half_up(5, 4)) == (1, 2, 1)
    with pytest.raises(ValueError):
        round_half_up(-1, 2)


def test_rounding_sensitive_order_adds_up_exactly():
    """N$ 1,999.04 of goods plus N$ 150.00 shipping: gross 214904, VAT 214904 x 3/23 = 28030.96,
    shipping net 15000 x 20/23 = 13043.48. Each part rounds on its own, yet the parts still sum."""
    totals = _totals(199_904)
    assert totals.total_cents == 214_904
    assert totals.tax_cents == 28_031
    assert totals.shipping_cents == 13_043
    assert totals.subtotal_cents == 214_904 - 28_031 - 13_043
    assert totals.subtotal_cents + totals.tax_cents + totals.shipping_cents == totals.total_cents


def test_totals_always_add_up():
    for goods in [*range(1, 20_000, 13), 499_999, 500_000, 500_001, 4_299_900]:
        t = _totals(goods)
        assert t.subtotal_cents + t.tax_cents + t.shipping_cents == t.total_cents
        assert t.tax_cents == _exact_vat(t.total_cents)
        assert min(t.subtotal_cents, t.tax_cents, t.shipping_cents) >= 0


@pytest.mark.parametrize(
    ("goods", "shipping_gross"),
    [(0, 0), (1, SHIP), (499_999, SHIP), (500_000, 0), (900_000, 0)],
)
def test_shipping_is_free_from_the_threshold(goods, shipping_gross):
    assert _totals(goods).shipping_gross_cents == shipping_gross
