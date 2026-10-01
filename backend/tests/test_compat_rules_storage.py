"""Storage connectivity rule. No database."""

from app.compat import evaluate
from app.models.enums import StorageFormFactor, StorageInterface
from tests.compat_factories import REQUIRED, ctx, motherboard, storage


def _sata(form_factor=StorageFormFactor.INCH_2_5):
    return storage(interface=StorageInterface.SATA, form_factor=form_factor, pcie_gen=None)


def _findings(*products, quantities=None):
    return {f.code: f for f in evaluate(ctx(*products, quantities=quantities), REQUIRED).findings}


def test_m2_drives_beyond_slots_counting_quantities():
    drive = storage()
    assert _findings(motherboard(m2_slots=2), drive, quantities={drive.id: 2}) == {}
    finding = _findings(motherboard(m2_slots=2), drive, quantities={drive.id: 3})["M2_SLOTS_EXCEEDED"]
    assert finding.details == {"m2_drives": 3, "m2_slots": 2}


def test_sata_drives_beyond_ports():
    a, b, c = _sata(), _sata(StorageFormFactor.INCH_3_5), _sata()
    finding = _findings(motherboard(sata_ports=2), a, b, c)["SATA_PORTS_EXCEEDED"]
    assert finding.details == {"sata_drives": 3, "sata_ports": 2}


def test_m2_sata_drive_uses_an_m2_slot_not_a_sata_port():
    m2_sata = storage(interface=StorageInterface.SATA, form_factor=StorageFormFactor.M2_2280, pcie_gen=None)
    findings = _findings(motherboard(m2_slots=0, sata_ports=0), m2_sata)
    assert set(findings) == {"M2_SLOTS_EXCEEDED"}


def test_no_motherboard_no_findings():
    assert _findings(storage(), storage(), storage(), storage()) == {}
