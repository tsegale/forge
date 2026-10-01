"""Physical fit inside the case: motherboard form factor, graphics card length, PSU form factor."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import ColumnElement

from ...models import BoardFormFactor, CaseProduct, GpuProduct, MotherboardProduct, PsuProduct
from ...models.enums import KindCode, PsuFormFactor
from ..context import BuildContext
from ..findings import Finding, conflict, warning
from .base import Rule


class FormFactorRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        board, case = ctx.motherboard, ctx.case
        if board and case:
            supported = sorted(f.code for f in case.supported_form_factors)
            if board.form_factor_code not in supported:
                yield conflict(
                    "FORM_FACTOR_UNSUPPORTED",
                    f"The {case.name} does not take {board.form_factor_code} motherboards.",
                    board,
                    case,
                    motherboard_form_factor=board.form_factor_code,
                    case_form_factors=supported,
                )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        if kind is KindCode.CASE and ctx.motherboard:
            return CaseProduct.supported_form_factors.any(BoardFormFactor.code == ctx.motherboard.form_factor_code)
        if kind is KindCode.MOTHERBOARD and ctx.case:
            return MotherboardProduct.form_factor_code.in_([f.code for f in ctx.case.supported_form_factors])
        return None


class GpuClearanceRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        case = ctx.case
        if case is None:
            return
        for card in ctx.gpu_products():
            if card.length_mm > case.max_gpu_length_mm:
                yield conflict(
                    "GPU_TOO_LONG",
                    f"The {card.name} is {card.length_mm} mm long; the {case.name} fits up to "
                    f"{case.max_gpu_length_mm} mm.",
                    card,
                    case,
                    gpu_length_mm=card.length_mm,
                    case_max_gpu_length_mm=case.max_gpu_length_mm,
                )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        if kind is KindCode.GPU and ctx.case:
            return GpuProduct.length_mm <= ctx.case.max_gpu_length_mm
        if kind is KindCode.CASE and ctx.gpus:
            return CaseProduct.max_gpu_length_mm >= max(g.length_mm for g in ctx.gpu_products())
        return None


# Case PSU bay -> {PSU form factor: None if it fits, else (severity, code)}. Combinations not listed
# conflict. SFX supplies fit ATX bays with an adapter bracket; SFX-L is 30 mm deeper than SFX.
PSU_BAY_FIT: dict[PsuFormFactor, dict[PsuFormFactor, tuple[str, str] | None]] = {
    PsuFormFactor.ATX: {
        PsuFormFactor.ATX: None,
        PsuFormFactor.SFX: ("warning", "PSU_NEEDS_BRACKET"),
        PsuFormFactor.SFX_L: ("warning", "PSU_NEEDS_BRACKET"),
    },
    PsuFormFactor.SFX: {
        PsuFormFactor.SFX: None,
        PsuFormFactor.SFX_L: ("warning", "PSU_SFX_L_CLEARANCE"),
    },
    PsuFormFactor.SFX_L: {
        PsuFormFactor.SFX: None,
        PsuFormFactor.SFX_L: None,
    },
}
PSU_MESSAGES = {
    "PSU_NEEDS_BRACKET": "The {psu} is {psu_ff}; the {case} has an ATX bay, so it needs an SFX-to-ATX bracket.",
    "PSU_SFX_L_CLEARANCE": "The {psu} is SFX-L (30 mm deeper than SFX); check the {case} has room for it.",
    "PSU_FORM_FACTOR_MISMATCH": "The {psu} is {psu_ff}; the {case} only takes {case_ff} power supplies.",
}


def _fitting(case_bay: PsuFormFactor) -> list[PsuFormFactor]:
    return list(PSU_BAY_FIT[case_bay])


class PsuFormFactorRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        psu, case = ctx.psu, ctx.case
        if not (psu and case):
            return
        fit = PSU_BAY_FIT[case.psu_form_factor]
        if psu.form_factor in fit and fit[psu.form_factor] is None:
            return
        severity, code = fit.get(psu.form_factor) or ("conflict", "PSU_FORM_FACTOR_MISMATCH")
        message = PSU_MESSAGES[code].format(
            psu=psu.name,
            case=case.name,
            psu_ff=psu.form_factor.value.upper().replace("_", "-"),
            case_ff=case.psu_form_factor.value.upper().replace("_", "-"),
        )
        build = conflict if severity == "conflict" else warning
        yield build(
            code,
            message,
            psu,
            case,
            psu_form_factor=psu.form_factor.value,
            case_psu_form_factor=case.psu_form_factor.value,
        )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        if kind is KindCode.PSU and ctx.case:
            return PsuProduct.form_factor.in_(_fitting(ctx.case.psu_form_factor))
        if kind is KindCode.CASE and ctx.psu:
            bays = [bay for bay, fits in PSU_BAY_FIT.items() if ctx.psu.form_factor in fits]
            return CaseProduct.psu_form_factor.in_(bays)
        return None
