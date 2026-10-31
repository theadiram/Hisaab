import copy
import unittest
import tempfile
import hashlib
import json
from pathlib import Path
from department_payment_import import normalize
from department_export_catalogue import reconcile, load_editions


class CatalogueTests(unittest.TestCase):
    def edition(self, import_id="one", amount="40", project="001", reference="allocation-1"):
        result = normalize(
            [
                dict(
                    source_system="a",
                    official_project_id=project,
                    project_evidence_reference="register",
                )
            ],
            [
                dict(
                    source_system="a",
                    source_payment_id="0001",
                    bill_voucher_id="b1",
                    component_id="",
                    currency="INR",
                    source_unit="rupees",
                    gross_amount="100",
                    net_amount="100",
                    recorded_status="Treasury accepted",
                    payee_label="private label",
                    evidence_reference="register",
                )
            ],
            [
                dict(
                    source_system="a",
                    source_payment_id="0001",
                    official_project_id=project,
                    component_id="",
                    allocated_amount=amount,
                    currency="INR",
                    source_unit="rupees",
                    amount_basis="net",
                    allocation_evidence_reference=reference,
                )
            ],
            "iso",
        )
        return dict(**result, importId=import_id)

    def test_repeat_exports_count_payment_and_share_once(self):
        result = reconcile([self.edition(), self.edition("two")])
        self.assertEqual(result["uniquePayments"], 1)
        r = result["records"][0]
        self.assertEqual(len(r["allocations"]), 1)
        self.assertEqual(r["duplicateEditionsExcluded"], 1)
        self.assertFalse(r["approved"])
        self.assertFalse(r["allocationCoverage"]["net"]["coversRecordedAmount"])
        self.assertNotIn("private label", str(result))

    def test_disjoint_project_shares_combine_without_duplicate_payment(self):
        result = reconcile([self.edition(), self.edition("two", "60", "002", "allocation-2")])
        self.assertEqual(result["uniquePayments"], 1)
        self.assertEqual(result["conflictingPayments"], 0)
        self.assertTrue(result["records"][0]["allocationCoverage"]["net"]["coversRecordedAmount"])
        self.assertFalse(result["records"][0]["settlementVerified"])

    def test_combined_shares_over_payment_quarantined(self):
        result = reconcile(
            [self.edition(amount="70"), self.edition("two", "60", "002", "allocation-2")]
        )
        self.assertEqual(result["conflictingPayments"], 1)
        self.assertEqual(result["records"][0]["allocationCoverage"], {})

    def test_changed_payment_edition_does_not_select_an_amount(self):
        first = self.edition()
        second = copy.deepcopy(first)
        second["importId"] = "two"
        second["records"][0]["amountsINR"]["net_amount"] = "90.00"
        result = reconcile([first, second])
        self.assertEqual(result["conflictingPayments"], 1)
        self.assertIsNone(result["records"][0]["amountsINR"])

    def test_same_project_different_allocation_references_not_blindly_summed(self):
        result = reconcile([self.edition(), self.edition("two", reference="revised-register")])
        self.assertEqual(result["conflictingPayments"], 1)

    def test_prior_quarantine_survives_new_export(self):
        first = self.edition()
        first["records"][0]["allocationReview"] = "quarantined"
        first["records"][0]["allocations"] = []
        self.assertEqual(reconcile([first, self.edition("two")])["conflictingPayments"], 1)

    def test_quarantined_row_excluded_by_importer_still_blocks_prior_edition(self):
        second = dict(
            importId="two", records=[], quarantine=[], blockedSourceIdentities=[["a", "0001", ""]]
        )
        self.assertEqual(reconcile([self.edition(), second])["conflictingPayments"], 1)

    def test_namespaces_and_components_remain_distinct(self):
        first = self.edition()
        second = copy.deepcopy(first)
        second["importId"] = "two"
        second["records"][0]["sourceIdentity"][2] = "component-2"
        self.assertEqual(reconcile([first, second])["uniquePayments"], 2)

    def preserved(self, base):
        originals = dict(
            projects=b"header\n",
            payments=b"source_system,source_payment_id,component_id\na,0001,\n",
            allocations=b"header\n",
            metadata=b"{}",
        )
        hashes = {k: hashlib.sha256(v).hexdigest() for k, v in originals.items()}
        import_id = hashlib.sha256(
            json.dumps(dict(hashes=hashes, parserVersion=1), sort_keys=True).encode()
        ).hexdigest()
        folder = Path(base) / import_id
        folder.mkdir()
        for key, value in originals.items():
            (folder / (key + ".original")).write_bytes(value)
        edition = self.edition(import_id)
        edition.update(originalHashes=hashes, parserVersion=1)
        edition["quarantine"] = [dict(table="payments", line=2)]
        raw = json.dumps(edition).encode()
        (folder / "assessment.json").write_bytes(raw)
        (folder / "assessment.sha256").write_text(hashlib.sha256(raw).hexdigest())
        return folder

    def test_preserved_loader_checks_originals_and_quarantined_identity(self):
        with tempfile.TemporaryDirectory() as base:
            folder = self.preserved(base)
            editions = load_editions(Path(base))
            self.assertEqual(editions[0]["blockedSourceIdentities"], [("a", "0001", "")])
            (folder / "payments.original").write_bytes(b"changed original")
            with self.assertRaisesRegex(ValueError, "Original export checksum"):
                load_editions(Path(base))

    def test_changed_assessment_rejected(self):
        with tempfile.TemporaryDirectory() as base:
            folder = self.preserved(base)
            (folder / "assessment.json").write_text("{}")
            with self.assertRaisesRegex(ValueError, "assessment checksum"):
                load_editions(Path(base))

    def test_empty_catalogue_never_becomes_coverage(self):
        result = reconcile([])
        self.assertEqual(result["uniquePayments"], 0)
        self.assertEqual(result["approvedPayments"], 0)


if __name__ == "__main__":
    unittest.main()
