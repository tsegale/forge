"""CPU cooler: socket support, fit in the case (tower height or radiator size), and capacity."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import ColumnElement, and_, or_

from ...models import CaseProduct, CoolerProduct, CpuProduct, Socket
from ...models.enums import CoolerType, KindCode
from ..context import BuildContext
from ..findings import Finding, conflict, warning
from .base import Rule


class CoolerSocketRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        cpu, cooler = ctx.cpu, ctx.cooler
        if not (cpu and cooler):
            return
        sockets = sorted(s.code for s in cooler.supported_sockets)
        if cpu.socket_code not in sockets:
            yield conflict(
                "COOLER_SOCKET_UNSUPPORTED",
                f"The {cooler.name} has no mounting for {cpu.socket_code}.",
                cpu,
                cooler,
                cpu_socket=cpu.socket_code,
                cooler_sockets=sockets,
            )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        if kind is KindCode.COOLER and ctx.cpu:
            return CoolerProduct.supported_sockets.any(Socket.code == ctx.cpu.socket_code)
        if kind is KindCode.CPU and ctx.cooler:
            return CpuProduct.socket_code.in_([s.code for s in ctx.cooler.supported_sockets])
        return None


class CoolerFitRule(Rule):
    """Air coolers must clear the side panel; AIO radiators must have a mount. A case listing no
    radiator size has no radiator support."""

    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        cooler, case = ctx.cooler, ctx.case
        if not (cooler and case):
            return
        if cooler.cooler_type is CoolerType.AIR and cooler.height_mm > case.max_cooler_height_mm:
            yield conflict(
                "COOLER_TOO_TALL",
                f"The {cooler.name} is {cooler.height_mm} mm tall; the {case.name} fits up to "
                f"{case.max_cooler_height_mm} mm.",
                cooler,
                case,
                cooler_height_mm=cooler.height_mm,
                case_max_cooler_height_mm=case.max_cooler_height_mm,
            )
        if cooler.cooler_type is CoolerType.AIO and (
            case.max_radiator_mm is None or cooler.radiator_mm > case.max_radiator_mm
        ):
            limit = "has no radiator mount" if case.max_radiator_mm is None else f"fits up to {case.max_radiator_mm} mm"
            yield conflict(
                "RADIATOR_UNSUPPORTED",
                f"The {cooler.name} has a {cooler.radiator_mm} mm radiator; the {case.name} {limit}.",
                cooler,
                case,
                radiator_mm=cooler.radiator_mm,
                case_max_radiator_mm=case.max_radiator_mm,
            )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        case, cooler = ctx.case, ctx.cooler
        if kind is KindCode.COOLER and case:
            air = and_(
                CoolerProduct.cooler_type == CoolerType.AIR, CoolerProduct.height_mm <= case.max_cooler_height_mm
            )
            if case.max_radiator_mm is None:
                return air
            aio = and_(CoolerProduct.cooler_type == CoolerType.AIO, CoolerProduct.radiator_mm <= case.max_radiator_mm)
            return or_(air, aio)
        if kind is KindCode.CASE and cooler:
            if cooler.cooler_type is CoolerType.AIR:
                return CaseProduct.max_cooler_height_mm >= cooler.height_mm
            return CaseProduct.max_radiator_mm >= cooler.radiator_mm  # NULL (no mount) never matches
        return None


class CoolerCapacityRule(Rule):
    """Only when the manufacturer publishes a rating; an unknown rating is not a failure."""

    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        cpu, cooler = ctx.cpu, ctx.cooler
        if cpu and cooler and cooler.tdp_rating_w is not None and cooler.tdp_rating_w < cpu.max_power_w:
            yield warning(
                "COOLER_UNDERRATED",
                f"The {cooler.name} is rated for {cooler.tdp_rating_w} W; the {cpu.name} can draw "
                f"{cpu.max_power_w} W under sustained load and may throttle.",
                cpu,
                cooler,
                cooler_tdp_rating_w=cooler.tdp_rating_w,
                cpu_max_power_w=cpu.max_power_w,
            )
