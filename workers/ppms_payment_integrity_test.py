import hashlib
import tempfile
import unittest
from pathlib import Path
from ppms_payment_integrity import audit


class OriginalEvidenceAuditTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        raw = b"%PDF preserved test bytes"
        (self.base / "bill.pdf").write_bytes(raw)
        self.record = dict(
            projectCode="project-A",
            billSerial="bill-1",
            sourceUrl="official-link",
            approved=False,
            settlementVerified=False,
            reportConflict=False,
            source=dict(file="bill.pdf", sha256=hashlib.sha256(raw).hexdigest()),
        )
        self.assessment = {"records": [self.record]}
        self.catalogue = {
            "records": [
                {
                    "Project Code": "project-A",
                    "Bill Serial No": "bill-1",
                    "sourceLinks": ["official-link"],
                }
            ],
            "conflicts": [],
        }

    def test_exact_preserved_original_passes(self):
        self.assertEqual(audit(self.base, self.assessment, self.catalogue)["documents"], 1)

    def test_changed_original_rejected(self):
        (self.base / "bill.pdf").write_bytes(b"%PDF changed")
        with self.assertRaisesRegex(ValueError, "checksum"):
            audit(self.base, self.assessment, self.catalogue)

    def test_wrong_bill_association_rejected(self):
        self.record["billSerial"] = "another-bill"
        with self.assertRaisesRegex(ValueError, "exact observed bill"):
            audit(self.base, self.assessment, self.catalogue)

    def test_duplicate_download_rejected(self):
        self.assessment["records"].append(dict(self.record))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            audit(self.base, self.assessment, self.catalogue)

    def test_unquarantined_conflict_rejected(self):
        self.catalogue["conflicts"] = [{"identity": ["project-A", "bill-1"]}]
        with self.assertRaisesRegex(ValueError, "quarantine"):
            audit(self.base, self.assessment, self.catalogue)

    def test_source_status_cannot_approve_settlement(self):
        self.record["settlementVerified"] = True
        with self.assertRaisesRegex(ValueError, "unsupported approval"):
            audit(self.base, self.assessment, self.catalogue)

    def test_failed_parse_original_is_still_audited(self):
        self.assessment = {"records": [], "failures": [self.record]}
        self.assertEqual(audit(self.base, self.assessment, self.catalogue)["preservedOriginals"], 1)
        (self.base / "bill.pdf").write_bytes(b"%PDF changed after parser failure")
        with self.assertRaisesRegex(ValueError, "checksum"):
            audit(self.base, self.assessment, self.catalogue)


if __name__ == "__main__":
    unittest.main()
