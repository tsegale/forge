"""The parts of a build, as rules see them."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import cast

from ..models import (
    CaseProduct,
    CoolerProduct,
    CpuProduct,
    GpuProduct,
    MemoryProduct,
    MotherboardProduct,
    Product,
    PsuProduct,
    StorageProduct,
)
from ..models.enums import KindCode

# Kinds a build holds at most one of. Choosing another one replaces it rather than adding to it.
SINGLE_SLOT_KINDS = frozenset({KindCode.CPU, KindCode.MOTHERBOARD, KindCode.PSU, KindCode.CASE, KindCode.COOLER})


@dataclass(frozen=True, slots=True)
class Part:
    product: Product
    quantity: int = 1


class BuildContext:
    """Read-only view of a build's parts with typed accessors. Holds no database session:
    every attribute rules read must already be loaded."""

    def __init__(self, parts: Iterable[Part]) -> None:
        self.parts: tuple[Part, ...] = tuple(parts)

    def of_kind(self, kind: KindCode) -> list[Part]:
        return [p for p in self.parts if p.product.kind_code == kind.value]

    def _one(self, kind: KindCode) -> Product | None:
        parts = self.of_kind(kind)
        return parts[0].product if parts else None

    @property
    def kinds(self) -> frozenset[str]:
        return frozenset(p.product.kind_code for p in self.parts)

    @property
    def cpu(self) -> CpuProduct | None:
        return cast(CpuProduct | None, self._one(KindCode.CPU))

    @property
    def motherboard(self) -> MotherboardProduct | None:
        return cast(MotherboardProduct | None, self._one(KindCode.MOTHERBOARD))

    @property
    def case(self) -> CaseProduct | None:
        return cast(CaseProduct | None, self._one(KindCode.CASE))

    @property
    def psu(self) -> PsuProduct | None:
        return cast(PsuProduct | None, self._one(KindCode.PSU))

    @property
    def cooler(self) -> CoolerProduct | None:
        return cast(CoolerProduct | None, self._one(KindCode.COOLER))

    @property
    def memory(self) -> list[Part]:
        return self.of_kind(KindCode.MEMORY)

    @property
    def gpus(self) -> list[Part]:
        return self.of_kind(KindCode.GPU)

    @property
    def storage(self) -> list[Part]:
        return self.of_kind(KindCode.STORAGE)

    def memory_products(self) -> list[MemoryProduct]:
        return [cast(MemoryProduct, p.product) for p in self.memory]

    def gpu_products(self) -> list[GpuProduct]:
        return [cast(GpuProduct, p.product) for p in self.gpus]

    def storage_products(self) -> list[StorageProduct]:
        return [cast(StorageProduct, p.product) for p in self.storage]

    def with_candidate(self, product: Product, quantity: int = 1) -> BuildContext:
        """This build with ``product`` added, replacing the current part of a single-slot kind.
        This is what "compatible with" means when browsing for a part to add or swap."""
        kind = KindCode(product.kind_code)
        kept = [p for p in self.parts if not (kind in SINGLE_SLOT_KINDS and p.product.kind_code == kind.value)]
        if any(p.product.id == product.id for p in kept):  # another unit of a part already chosen
            return BuildContext(
                Part(p.product, p.quantity + quantity) if p.product.id == product.id else p for p in kept
            )
        return BuildContext([*kept, Part(product, quantity)])

    def without_kind(self, kind: KindCode) -> BuildContext:
        return BuildContext(p for p in self.parts if p.product.kind_code != kind.value)
