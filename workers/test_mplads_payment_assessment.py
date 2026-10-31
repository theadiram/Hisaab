import json
import unittest
from mplads_payment_assessment import assess


class MpladsAssessmentTests(unittest.TestCase):
    def sample(self, **changes):
        row = dict(
            WORK_ID="WS/MP1/2025-2026/7",
            WORK_RECOMMENDATION_DTL_ID=7,
            STATE_NAME="Odisha",
            EXPENDITURE_DATE="21-Aug-2026",
            FUND_DISBURSED_AMT="1234.50",
            WORK_STATUS="Payment Success",
            VENDOR_NAME="Vendor",
        )
        return dict(row, **changes)

    def encode(self, rows):
        return json.dumps(
            {"Total Expenditure": json.dumps(rows + [{"Total_Amt": "1234.50"}])}
        ).encode()

    def test_success_not_independent_settlement_and_summary_excluded(self):
        records, summary = assess(self.encode([self.sample()]))
        self.assertEqual(summary["rows"], 1)
        self.assertEqual(records[0]["sourceReportedDisbursedRupees"], "1234.50")
        self.assertFalse(records[0]["settlementVerified"])
        self.assertFalse(records[0]["approved"])

    def test_same_work_date_amount_not_automatically_deduplicated(self):
        records, summary = assess(self.encode([self.sample(), self.sample()]))
        self.assertEqual(summary["distinctWorkIds"], 1)
        self.assertEqual(len(records), 2)
        self.assertTrue(all(r["sourceTransactionId"] is None for r in records))

    def test_invalid_date_amount_remain_unknown(self):
        records, _ = assess(
            self.encode([self.sample(EXPENDITURE_DATE="bad", FUND_DISBURSED_AMT="NaN")])
        )
        self.assertIsNone(records[0]["expenditureDate"])
        self.assertIsNone(records[0]["sourceReportedDisbursedRupees"])

    def test_bad_utf8_is_flagged_without_replacement(self):
        raw = self.encode([self.sample(VENDOR_NAME="placeholder")]).replace(
            b"placeholder", b"vendor\xe8"
        )
        records, summary = assess(raw)
        self.assertEqual(summary["encodingIssueRows"], 1)
        self.assertIn("\udce8", records[0]["vendorLabel"])


if __name__ == "__main__":
    unittest.main()
