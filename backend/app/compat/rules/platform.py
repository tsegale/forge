"""CPU socket and memory: what the motherboard can physically accept."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import ColumnElement, and_, false

from ...models import CpuProduct, MemoryProduct, MotherboardProduct
from ...models.enums import KindCode
from ..context import BuildContext
from ..findings import Finding, conflict, warning
from .base import Rule


class SocketRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        cpu, board = ctx.cpu, ctx.motherboard
        if cpu and board and cpu.socket_code != board.socket_code:
            yield conflict(
                "SOCKET_MISMATCH",
                f"The {cpu.name} needs a {cpu.socket_code} motherboard; the {board.name} is {board.socket_code}.",
                cpu,
                board,
                cpu_socket=cpu.socket_code,
                motherboard_socket=board.socket_code,
            )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        if kind is KindCode.CPU and ctx.motherboard:
            return CpuProduct.socket_code == ctx.motherboard.socket_code
        if kind is KindCode.MOTHERBOARD and ctx.cpu:
            return MotherboardProduct.socket_code == ctx.cpu.socket_code
        return None


def _used_modules(ctx: BuildContext) -> int:
    return sum(p.product.modules * p.quantity for p in ctx.memory)


def _used_capacity_gb(ctx: BuildContext) -> int:
    return sum(p.product.total_capacity_gb * p.quantity for p in ctx.memory)


class MemoryRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        kits = ctx.memory_products()
        if len({k.id for k in kits}) > 1:
            yield warning(
                "MIXED_MEMORY_KITS",
                "Mixing memory kits can force every module down to the slowest kit's speed and timings, "
                "or fail to train at all. A single kit with the total capacity is more reliable.",
                *kits,
                kits=len({k.id for k in kits}),
            )
        board = ctx.motherboard
        if board is None or not kits:
            return
        for kit in kits:
            if kit.memory_type != board.memory_type:
                yield conflict(
                    "MEMORY_TYPE_MISMATCH",
                    f"The {board.name} takes {board.memory_type.value.upper()}; "
                    f"the {kit.name} is {kit.memory_type.value.upper()}.",
                    kit,
                    board,
                    memory_type=kit.memory_type.value,
                    motherboard_memory_type=board.memory_type.value,
                )
        modules = _used_modules(ctx)
        if modules > board.memory_slots:
            yield conflict(
                "MEMORY_SLOTS_EXCEEDED",
                f"The memory adds up to {modules} modules; the {board.name} has {board.memory_slots} slots.",
                board,
                *kits,
                modules=modules,
                memory_slots=board.memory_slots,
            )
        capacity = _used_capacity_gb(ctx)
        if capacity > board.max_memory_gb:
            yield conflict(
                "MEMORY_CAPACITY_EXCEEDED",
                f"The memory totals {capacity} GB; the {board.name} supports up to {board.max_memory_gb} GB.",
                board,
                *kits,
                capacity_gb=capacity,
                max_memory_gb=board.max_memory_gb,
            )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        board = ctx.motherboard
        if kind is KindCode.MEMORY and board:
            return and_(
                MemoryProduct.memory_type == board.memory_type,
                MemoryProduct.modules + _used_modules(ctx) <= board.memory_slots,
                MemoryProduct.total_capacity_gb + _used_capacity_gb(ctx) <= board.max_memory_gb,
            )
        if kind is KindCode.MOTHERBOARD and ctx.memory:
            types = {k.memory_type for k in ctx.memory_products()}
            if len(types) > 1:
                return false()  # no board takes both DDR4 and DDR5
            return and_(
                MotherboardProduct.memory_type == types.pop(),
                MotherboardProduct.memory_slots >= _used_modules(ctx),
                MotherboardProduct.max_memory_gb >= _used_capacity_gb(ctx),
            )
        return None
