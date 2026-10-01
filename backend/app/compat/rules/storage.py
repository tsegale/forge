"""Storage connectivity: M.2 drives need M.2 slots, 2.5"/3.5" SATA drives need SATA ports."""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import ColumnElement, and_, false, or_, true

from ...models import MotherboardProduct, StorageProduct
from ...models.enums import KindCode, StorageFormFactor, StorageInterface
from ..context import BuildContext
from ..findings import Finding, conflict
from .base import Rule


def _uses_m2(drive: StorageProduct) -> bool:
    # By form factor, not interface: an M.2 SATA drive still occupies an M.2 slot.
    return drive.form_factor is StorageFormFactor.M2_2280


def _uses_sata_port(drive: StorageProduct) -> bool:
    return drive.interface is StorageInterface.SATA and not _uses_m2(drive)


def _count(ctx: BuildContext, uses) -> int:
    return sum(p.quantity for p in ctx.storage if uses(p.product))


class StorageConnectivityRule(Rule):
    def check(self, ctx: BuildContext) -> Iterator[Finding]:
        board = ctx.motherboard
        if board is None:
            return
        m2_drives = [d for d in ctx.storage_products() if _uses_m2(d)]
        m2 = _count(ctx, _uses_m2)
        if m2 > board.m2_slots:
            yield conflict(
                "M2_SLOTS_EXCEEDED",
                f"The build has {m2} M.2 drives; the {board.name} has {board.m2_slots} M.2 slots.",
                board,
                *m2_drives,
                m2_drives=m2,
                m2_slots=board.m2_slots,
            )
        sata_drives = [d for d in ctx.storage_products() if _uses_sata_port(d)]
        sata = _count(ctx, _uses_sata_port)
        if sata > board.sata_ports:
            yield conflict(
                "SATA_PORTS_EXCEEDED",
                f"The build has {sata} SATA drives; the {board.name} has {board.sata_ports} SATA ports.",
                board,
                *sata_drives,
                sata_drives=sata,
                sata_ports=board.sata_ports,
            )

    def compatible_filter(self, ctx: BuildContext, kind: KindCode) -> ColumnElement[bool] | None:
        board = ctx.motherboard
        if kind is KindCode.STORAGE and board:
            # Every non-M.2 drive is SATA (ck_storage_specs_interface_consistent).
            is_m2 = StorageProduct.form_factor == StorageFormFactor.M2_2280
            m2_free = _count(ctx, _uses_m2) < board.m2_slots
            sata_free = _count(ctx, _uses_sata_port) < board.sata_ports
            return or_(and_(is_m2, true() if m2_free else false()), and_(~is_m2, true() if sata_free else false()))
        if kind is KindCode.MOTHERBOARD and ctx.storage:
            return and_(
                MotherboardProduct.m2_slots >= _count(ctx, _uses_m2),
                MotherboardProduct.sata_ports >= _count(ctx, _uses_sata_port),
            )
        return None
