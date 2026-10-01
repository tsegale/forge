"""Socket and memory rules. No database."""

import pytest

from app.compat import evaluate
from app.compat.rules.platform import MemoryRule, SocketRule
from app.models.enums import MemoryType
from tests.compat_factories import REQUIRED, cpu, ctx, full_build, memory, motherboard


def _codes(*products, quantities=None):
    report = evaluate(ctx(*products, quantities=quantities), REQUIRED)
    return {f.code: f for f in report.findings}


def test_reference_build_has_no_findings():
    assert _codes(*full_build()) == {}


def test_socket_mismatch_is_a_conflict_with_details():
    a, b = cpu(socket_code="AM5"), motherboard(socket_code="LGA1700")
    finding = _codes(a, b)["SOCKET_MISMATCH"]
    assert finding.severity == "conflict"
    assert finding.product_ids == tuple(sorted((a.id, b.id)))
    assert finding.details == {"cpu_socket": "AM5", "motherboard_socket": "LGA1700"}


def test_socket_rule_needs_both_parts():
    assert list(SocketRule().check(ctx(cpu(socket_code="AM4")))) == []


def test_memory_type_mismatch():
    finding = _codes(motherboard(memory_type=MemoryType.DDR5), memory(memory_type=MemoryType.DDR4))[
        "MEMORY_TYPE_MISMATCH"
    ]
    assert finding.details == {"memory_type": "ddr4", "motherboard_memory_type": "ddr5"}


def test_modules_beyond_slots_counting_quantities():
    kit = memory(modules=2)
    board = motherboard(memory_slots=2)
    assert "MEMORY_SLOTS_EXCEEDED" not in _codes(board, kit)
    finding = _codes(board, kit, quantities={kit.id: 2})["MEMORY_SLOTS_EXCEEDED"]
    assert finding.details == {"modules": 4, "memory_slots": 2}


def test_capacity_beyond_board_maximum():
    board = motherboard(max_memory_gb=64, memory_slots=4)
    kit = memory(modules=2, module_capacity_gb=48)
    assert _codes(board, kit)["MEMORY_CAPACITY_EXCEEDED"].details == {"capacity_gb": 96, "max_memory_gb": 64}


def test_two_different_kits_warn_even_when_they_fit():
    a, b = memory(), memory()
    findings = _codes(motherboard(memory_slots=4), a, b)
    assert set(findings) == {"MIXED_MEMORY_KITS"}
    assert findings["MIXED_MEMORY_KITS"].severity == "warning"


def test_two_of_the_same_kit_is_not_mixing():
    kit = memory()
    assert "MIXED_MEMORY_KITS" not in _codes(motherboard(memory_slots=4), kit, quantities={kit.id: 2})


def test_mixed_kits_warn_without_a_motherboard():
    assert set(_codes(memory(), memory())) == {"MIXED_MEMORY_KITS"}


@pytest.mark.parametrize("rule", [SocketRule(), MemoryRule()])
def test_rules_report_nothing_for_an_empty_build(rule):
    assert list(rule.check(ctx())) == []
