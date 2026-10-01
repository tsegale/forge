"""Order totals with VAT-inclusive prices (Namibian VAT, 15%).

Catalog prices and the flat shipping fee include VAT. VAT is computed once, on the gross total
(goods plus shipping), and the net amounts are derived from it, so

    total = subtotal + tax + shipping

holds exactly for every amount (the orders table enforces it with a CHECK). All arithmetic is in
integer cents; division rounds half up, exactly, with no floating point anywhere.
"""

from __future__ import annotations

from dataclasses import dataclass

from flask import current_app

BPS = 10_000  # basis points per 100%


def round_half_up(numerator: int, denominator: int) -> int:
    """numerator / denominator rounded to the nearest integer, halves away from zero (inputs >= 0)."""
    if numerator < 0 or denominator <= 0:
        raise ValueError("round_half_up expects a non-negative numerator and a positive denominator")
    return (2 * numerator + denominator) // (2 * denominator)


def included_vat(gross_cents: int, rate_bps: int) -> int:
    """The VAT contained in a VAT-inclusive amount: gross x rate / (1 + rate)."""
    return round_half_up(gross_cents * rate_bps, BPS + rate_bps)


@dataclass(frozen=True, slots=True)
class Totals:
    goods_gross_cents: int
    shipping_gross_cents: int
    subtotal_cents: int  # goods, net of VAT
    shipping_cents: int  # shipping, net of VAT
    tax_cents: int  # VAT on goods and shipping together
    total_cents: int  # what the customer pays

    def __post_init__(self) -> None:
        if self.total_cents != self.subtotal_cents + self.tax_cents + self.shipping_cents:
            raise AssertionError("totals do not add up")  # unreachable by construction


def shipping_for(goods_gross_cents: int, *, flat_cents: int, free_threshold_cents: int) -> int:
    """Flat VAT-inclusive fee; free once the goods (gross) reach the threshold. Empty carts ship free."""
    if goods_gross_cents == 0 or goods_gross_cents >= free_threshold_cents:
        return 0
    return flat_cents


def compute(goods_gross_cents: int, *, vat_rate_bps: int, flat_cents: int, free_threshold_cents: int) -> Totals:
    shipping_gross = shipping_for(goods_gross_cents, flat_cents=flat_cents, free_threshold_cents=free_threshold_cents)
    gross = goods_gross_cents + shipping_gross
    tax = included_vat(gross, vat_rate_bps)
    shipping_net = round_half_up(shipping_gross * BPS, BPS + vat_rate_bps)
    return Totals(
        goods_gross_cents=goods_gross_cents,
        shipping_gross_cents=shipping_gross,
        subtotal_cents=gross - tax - shipping_net,
        shipping_cents=shipping_net,
        tax_cents=tax,
        total_cents=gross,
    )


def totals(goods_gross_cents: int) -> Totals:
    cfg = current_app.config
    return compute(
        goods_gross_cents,
        vat_rate_bps=cfg["VAT_RATE_BPS"],
        flat_cents=cfg["SHIPPING_FLAT_CENTS"],
        free_threshold_cents=cfg["FREE_SHIPPING_THRESHOLD_CENTS"],
    )
