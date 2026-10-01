"""Power supply capacity, headroom, excursion tolerance and connectors."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import ColumnElement

from ...models import PsuProduct
from ...models.enums import KindCode
from ..context import BuildContext
from ..findings import Finding, conflict, warning
from ..power import EXCURSION_TOLERANCE, TARGET_LOAD, estimate, part_watts_sql, sustained_w
from .base import Rule

# Both names refer to the same 16-pin connector family (12V-2x6 is the revised 12VHPWR).
SIXTEEN_PIN_MARKERS = ("12vhpwr", "12v-2x6", "16-pin")


def needs_16_pin(power_connectors: str) -> bool:
    text = power_connectors.lower()
    return any(marker in text for marker in SIXTEEN_PIN_MARKERS)


class PowerRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        psu = ctx.psu
        if psu is None:
            return
        power = estimate(ctx)
        loaded = [p.product for p in ctx.parts if p.product.kind_code in (KindCode.CPU, KindCode.GPU)]
        rating = psu.wattage_w

        if power.sustained_w > rating:
            yield conflict(
                "PSU_INSUFFICIENT",
                f"The build draws about {power.sustained_w} W under sustained load; the {psu.name} "
                f"is rated for {rating} W.",
                psu,
                *loaded,
                sustained_w=power.sustained_w,
                psu_w=rating,
            )
        elif power.sustained_w > rating * TARGET_LOAD:
            yield warning(
                "PSU_HIGH_LOAD",
                f"The build would run the {psu.name} at {round(100 * power.sustained_w / rating)}% load; "
                f"{power.recommended_psu_w} W or more leaves comfortable headroom.",
                psu,
                *loaded,
                sustained_w=power.sustained_w,
                psu_w=rating,
                recommended_psu_w=power.recommended_psu_w,
            )

        tolerance = EXCURSION_TOLERANCE[psu.atx_version]
        if power.peak_w > rating * tolerance:
            yield warning(
                "PSU_TRANSIENT_RISK",
                f"Graphics card power spikes can reach about {power.peak_w} W; the {psu.name} "
                f"(ATX {psu.atx_version.value}) may shut down under them.",
                psu,
                *ctx.gpu_products(),
                peak_w=power.peak_w,
                psu_w=rating,
                atx_version=psu.atx_version.value,
                excursion_tolerance=tolerance,
            )

        for card in ctx.gpu_products():
            if rating < card.recommended_psu_w:
                yield warning(
                    "PSU_BELOW_GPU_RECOMMENDATION",
                    f"The {card.name}'s manufacturer recommends at least a {card.recommended_psu_w} W "
                    f"supply; the {psu.name} is {rating} W.",
                    psu,
                    card,
                    psu_w=rating,
                    gpu_recommended_psu_w=card.recommended_psu_w,
                )
            if needs_16_pin(card.power_connectors) and not psu.has_12v_2x6:
                yield warning(
                    "PSU_NEEDS_ADAPTER",
                    f"The {card.name} uses a 16-pin connector; the {psu.name} has no native 12V-2x6 "
                    "cable, so it needs the adapter supplied with the card.",
                    psu,
                    card,
                    gpu_connectors=card.power_connectors,
                )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        """Only PSU_INSUFFICIENT is a conflict: candidate draw must fit in what the supply has left."""
        if kind is KindCode.PSU:
            return PsuProduct.wattage_w >= sustained_w(ctx)
        if ctx.psu and kind in (KindCode.CPU, KindCode.GPU, KindCode.MEMORY, KindCode.STORAGE):
            return part_watts_sql(kind) <= ctx.psu.wattage_w - sustained_w(ctx)
        return None
