import copy
import contextlib
import csv
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import department_payment_import as importer
from department_payment_import import normalize, read_csv, PAYMENT_COLUMNS, source_amount


class DepartmentImportTests(unittest.TestCase):
    def setUp(self):
        self.projects = [
            dict(
                source_system="agency",
                official_project_id=p,
                project_evidence_reference="register/" + p,
            )
            for p in ("001", "002")
        ]
        self.payment = dict(
            source_system="agency",
            source_payment_id="0001",
            component_id="",
            bill_voucher_id="bill-01",
            recorded_status="Treasury accepted",
            treasury_date="2026-01-02",
            payee_label="Agency engineer",
            payee_role="",
            flow_type="departmental_advance",
            gross_amount="1.000",
            deduction_amount="0.100",
            net_amount="0.900",
            currency="INR",
            source_unit="lakh",
            evidence_reference="bill register row 1",
        )
        self.shares = [
            dict(
                source_system="agency",
                source_payment_id="0001",
                component_id="",
                official_project_id=p,
                allocated_amount=amount,
                currency="INR",
                source_unit="rupees",
                amount_basis="net",
                allocation_evidence_reference="allocation/" + p,
            )
            for p, amount in [("001", "40000"), ("002", "50000")]
        ]

    def run_sample(self, payments=None, shares=None):
        return normalize(
            self.projects,
            payments if payments is not None else [self.payment],
            shares if shares is not None else self.shares,
            "iso",
        )

    def test_split_joins_preserve_ids_and_do_not_infer_staff_role_or_settlement(self):
        result = self.run_sample()
        record = result["records"][0]
        self.assertEqual(record["sourceIdentity"], ["agency", "0001", ""])
        self.assertEqual(record["amountsINR"]["net_amount"], "90000.00")
        self.assertEqual([a["projectId"] for a in record["allocations"]], ["001", "002"])
        self.assertTrue(all(a["coversRecordedAmount"] for a in record["allocations"]))
        self.assertEqual(record["sourceDates"]["treasury_date"]["iso"], "2026-01-02")
        self.assertIsNone(record["sourceDates"]["recipient_credit_return_date"]["iso"])
        self.assertIsNone(record["settlementDate"])
        self.assertIsNone(record["sourcePayeeRole"])
        self.assertFalse(record["approved"])
        self.assertFalse(record["publicationReady"])

    def test_duplicate_package_amount_on_two_projects_quarantines_all_shares(self):
        shares = copy.deepcopy(self.shares)
        for share in shares:
            share["allocated_amount"] = "90000"
        result = self.run_sample(shares=shares)
        self.assertEqual(result["records"][0]["allocations"], [])
        self.assertEqual(result["records"][0]["allocationReview"], "quarantined")
        self.assertEqual(len(result["quarantine"]), 2)

    def test_duplicate_transaction_deduplicates_but_conflicting_editions_exclude_both(self):
        result = self.run_sample(payments=[self.payment, self.payment])
        self.assertEqual(len(result["records"]), 1)
        self.assertEqual(result["duplicatesExcluded"], 1)
        other = {**self.payment, "gross_amount": "2", "net_amount": "1.9"}
        conflict = self.run_sample(payments=[self.payment, other])
        self.assertEqual(conflict["records"], [])
        self.assertTrue(any("Conflicting editions" in q["reason"] for q in conflict["quarantine"]))

    def test_name_only_or_wrong_component_matches_cannot_allocate(self):
        for change in ({"official_project_id": "Named road"}, {"component_id": "different"}):
            share = {**self.shares[0], **change}
            result = self.run_sample(shares=[share])
            self.assertEqual(result["records"][0]["allocations"], [])
            self.assertTrue(result["quarantine"])

    def test_amount_date_conflicts_and_unknown_units_remain_quarantined(self):
        for change in (
            {"source_unit": "unknown"},
            {"net_amount": "0.8"},
            {"treasury_date": "2026-02-30"},
            {"net_amount": "-1"},
        ):
            result = self.run_sample(payments=[{**self.payment, **change}])
            self.assertEqual(result["records"], [])
            self.assertTrue(result["quarantine"])
        self.assertEqual(source_amount("536.700", "lakh"), "53670000.00")
        with self.assertRaisesRegex(ValueError, "Fractional paise"):
            source_amount("0.00000001", "lakh")

    def test_failed_and_partial_source_records_never_become_public_payments(self):
        record = self.run_sample(
            payments=[{**self.payment, "recorded_status": "Failed"}], shares=self.shares[:1]
        )["records"][0]
        self.assertEqual(record["sourceStatus"], "Failed")
        self.assertFalse(record["allocations"][0]["coversRecordedAmount"])
        self.assertFalse(record["settlementVerified"])
        self.assertFalse(record["publicationReady"])

    def test_sensitive_or_unexpected_columns_rejected_before_normalization(self):
        raw = b"source_system,source_payment_id,bank_account\nagency,1,private\n"
        with self.assertRaisesRegex(ValueError, "sensitive or unexpected"):
            read_csv(raw, PAYMENT_COLUMNS, {"source_system", "source_payment_id"})

    def test_repeat_import_preserves_originals_and_rejects_changed_assessment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            inputs = root / "inputs"
            inputs.mkdir()
            for name, rows in [
                ("projects", self.projects),
                ("payments", [self.payment]),
                ("allocations", self.shares),
            ]:
                with (inputs / (name + ".csv")).open("w", newline="") as handle:
                    writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
                    writer.writeheader()
                    writer.writerows(rows)
            (inputs / "metadata.json").write_text(
                json.dumps(
                    dict(
                        sourceReference="test fixture",
                        fieldDefinitionsReference="fixture mapping",
                        scopeDescription="isolated test only",
                        dateFormat="iso",
                    )
                )
            )
            argv = ["import"]
            for name in ("projects", "payments", "allocations", "metadata"):
                argv.extend(
                    [
                        "--" + name,
                        str(inputs / (name + (".json" if name == "metadata" else ".csv"))),
                    ]
                )
            with (
                patch.object(importer, "ROOT", root),
                patch("sys.argv", argv),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                importer.main()
                assessment = next(
                    (root / "data/acquisition/department-exports").glob("*/assessment.json")
                )
                first = assessment.read_bytes()
                importer.main()
                self.assertEqual(first, assessment.read_bytes())
                self.assertEqual(len(list(assessment.parent.glob("*.original"))), 4)
                assessment.write_text("changed")
                with self.assertRaisesRegex(ValueError, "assessment changed"):
                    importer.main()


if __name__ == "__main__":
    unittest.main()
