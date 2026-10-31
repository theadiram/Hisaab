import copy
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from ppms_visible_import import validate_capture


class VisibleImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.row = dict(
            projectCode="project-1",
            billSerial="bill-1",
            reportAmount="100.05",
            sourceUrl="https://ppms.odisha.gov.in/report/ifms-transaction?block=Balangir",
            capturedAt="2026-10-08T13:00:00Z",
            records=[
                dict(
                    serial="1",
                    sourceName="Official role",
                    component="Royalty",
                    amount="100.00",
                    sourcePaymentStatus="Success",
                )
            ],
        )
        self.catalogue = {
            "records": [
                {
                    "Project Code": "project-1",
                    "Bill Serial No": "bill-1",
                    "Total Expenditure Amount": "100.05",
                    "Status": "Bill successful from treasury",
                }
            ]
        }
        self.preserve()

    def preserve(self):
        raw = json.dumps({k: v for k, v in self.row.items() if k != "sourceSnapshot"}).encode()
        (self.base / "capture.json").write_bytes(raw)
        self.row["sourceSnapshot"] = {
            "file": "capture.json",
            "sha256": hashlib.sha256(raw).hexdigest(),
        }

    def test_difference_stays_difference_and_success_never_approves(self):
        self.row.update(approved=True, settlementVerified=True)
        result = validate_capture(self.row, self.base, self.catalogue, [])
        self.assertEqual(result["beneficiarySum"], "100.00")
        self.assertFalse(result["matchesReportAmount"])
        self.assertFalse(result["approved"])
        self.assertFalse(result["settlementVerified"])

    def test_wrong_identity_or_changed_observation_rejected(self):
        self.row["billSerial"] = "other-bill"
        with self.assertRaises(ValueError):
            validate_capture(self.row, self.base, self.catalogue, [])
        self.row["billSerial"] = "bill-1"
        self.row["records"][0]["amount"] = "999.00"
        with self.assertRaises(ValueError):
            validate_capture(self.row, self.base, self.catalogue, [])

    def test_corruption_and_sensitive_component_fields_rejected(self):
        (self.base / "capture.json").write_bytes(b"corrupted")
        with self.assertRaises(ValueError):
            validate_capture(self.row, self.base, self.catalogue, [])
        self.row["records"][0]["bankAccount"] = "must not enter private review projection"
        self.preserve()
        with self.assertRaises(ValueError):
            validate_capture(self.row, self.base, self.catalogue, [])

    def test_identical_previous_bill_table_requires_reinspection(self):
        old = copy.deepcopy(self.row)
        old["billSerial"] = "previous-bill"
        with self.assertRaisesRegex(ValueError, "stale dialog"):
            validate_capture(self.row, self.base, self.catalogue, [old])


if __name__ == "__main__":
    unittest.main()
