"""Engine core: report shape, ordering, and completeness (missing kinds). No database."""

from app.compat import evaluate
from app.compat.findings import Severity, conflict, warning
from app.compat.rules.base import Rule
from app.models.enums import KindCode
from tests.compat_factories import REQUIRED, cooler, cpu, ctx, full_build, gpu


def _report(*products, rules=None):
    return evaluate(ctx(*products), REQUIRED, rules=rules if rules is not None else [])


def test_complete_build_is_complete():
    report = _report(*full_build())
    assert report.complete and report.missing_kinds == ()


def test_empty_build_lists_required_kinds_in_catalog_order():
    assert _report().missing_kinds == ("cpu", "motherboard", "memory", "storage", "psu", "case")


def test_cpu_without_integrated_graphics_needs_a_gpu():
    report = _report(*full_build(cpu=cpu(has_integrated_graphics=False), gpu=None))
    assert report.missing_kinds == ("gpu",)
    assert report.compatible  # missing a part is not a conflict


def test_cpu_with_integrated_graphics_needs_no_gpu():
    assert _report(*full_build(cpu=cpu(has_integrated_graphics=True), gpu=None)).complete


def test_cpu_without_a_bundled_cooler_needs_one():
    assert _report(*full_build(cpu=cpu(includes_cooler=False), cooler=None)).missing_kinds == ("cooler",)


def test_bundled_cooler_satisfies_the_requirement():
    assert _report(*full_build(cpu=cpu(includes_cooler=True), cooler=None)).complete


def test_no_cpu_means_no_conditional_requirements():
    report = _report(*[p for p in full_build(cooler=None, gpu=None) if p.kind_code != "cpu"])
    assert report.missing_kinds == ("cpu",)


class _Fixed(Rule):
    def __init__(self, *findings):
        self.findings = findings

    def check(self, ctx):
        yield from self.findings


def test_findings_are_split_and_ordered_conflicts_first():
    a, b = cpu(), gpu()
    rules = [_Fixed(warning("W_B", "w", b), conflict("C_Z", "c", a)), _Fixed(conflict("C_A", "c", b))]
    report = _report(a, b, rules=rules)
    assert [f.code for f in report.findings] == ["C_A", "C_Z", "W_B"]
    assert [f.code for f in report.conflicts] == ["C_A", "C_Z"]
    assert [f.code for f in report.warnings] == ["W_B"]
    assert not report.compatible


def test_warnings_alone_keep_a_build_compatible():
    report = _report(cpu(), rules=[_Fixed(warning("W", "w", cpu()))])
    assert report.compatible and report.warnings[0].severity is Severity.WARNING


def test_candidate_replaces_single_slot_parts_and_adds_to_multi_slot_ones():
    base = ctx(*full_build())
    swapped = base.with_candidate(cpu(socket_code="LGA1700"))
    assert swapped.cpu.socket_code == "LGA1700" and len(swapped.of_kind(KindCode.CPU)) == 1
    added = base.with_candidate(gpu())
    assert len(added.gpus) == 2


def test_candidate_cooler_replaces_existing_cooler():
    swapped = ctx(*full_build()).with_candidate(cooler(height_mm=37))
    assert swapped.cooler.height_mm == 37
