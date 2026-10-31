import json
import unittest

from cag_state_accounts_indicators import (
    MANIFEST,
    MANUAL_REVIEW,
    NUMBER,
    amount,
    extract_report,
    parse_indicator_line,
)


class CAGStateAccountIndicatorTests(unittest.TestCase):
    def test_indian_grouped_amounts_are_preserved_exactly(self):
        for raw, expected in [("1,06,71.08", "10671.08"), ("2,88,000.00", "288000.00")]:
            match = NUMBER.search(raw)
            self.assertIsNotNone(match)
            self.assertEqual(amount(match.group()), expected)

    def test_negative_and_plain_amounts_keep_sign_and_decimals(self):
        values = [
            NUMBER.search("−1,05,23.33".replace("−", "-")),
            NUMBER.search("-10523.33"),
            NUMBER.search("0.00"),
        ]
        self.assertEqual(amount(values[0].group()), "-10523.33")
        self.assertEqual(amount(values[1].group()), "-10523.33")
        self.assertEqual(amount(values[2].group()), "0.00")

    def test_child_reference_does_not_masquerade_as_parent_capital_receipts(self):
        row = parse_indicator_line(
            "     (a) Recovery of Loans and Advances (Non debt Capital Receipts) 700.00 152.12 21.73 20.12"
        )
        self.assertIsNone(row)

    def test_formula_and_grouped_total_still_parse_as_the_whole_amount(self):
        row = parse_indicator_line("3. Total Receipts (1 + 2) 2,88,000.00 42,064.49 14.61 14.63")
        self.assertEqual(row["sourceRowLabel"], "Total Receipts")
        self.assertEqual(row["budgetEstimateCroreText"], "288000.00")
        self.assertEqual(row["actualsUpToReportingPeriodCroreText"], "42064.49")

    @unittest.skipUnless(
        MANIFEST.exists() and MANUAL_REVIEW.exists(),
        "Private source-acquisition fixtures are not included in the public checkout",
    )
    def test_visual_transcriptions_are_bound_to_originals_and_remain_unapproved(self):
        manifest = json.loads(MANIFEST.read_text())
        reports = {r["state"]: r for r in manifest["reports"]}
        reviews = json.loads(MANUAL_REVIEW.read_text())["reviews"]
        self.assertEqual(set(reviews), {"Gujarat", "Meghalaya", "Uttarakhand"})
        self.assertEqual(sum(len(r["rows"]) for r in reviews.values()), 36)
        for state, review in reviews.items():
            with self.subTest(state=state):
                self.assertEqual(review["sourceSha256"], reports[state]["sha256"])
                snapshot = extract_report(reports[state])
                self.assertEqual(
                    snapshot["extractionStatus"],
                    "manually_transcribed_visual_review_candidate_rows",
                )
                self.assertEqual(len(snapshot["records"]), 14 if state == "Uttarakhand" else 11)
                self.assertTrue(
                    all(row["publicationApproved"] is False for row in snapshot["records"])
                )
                self.assertTrue(all(row["sourceTextLine"] is None for row in snapshot["records"]))
                self.assertEqual(snapshot["sourceOriginalPath"], reports[state]["originalPath"])
        uk = reviews["Uttarakhand"]["rows"]
        self.assertFalse(any(r["sourceRowLabel"] == "General Sector" for r in uk))
        self.assertTrue(any(r["sourceRowLabel"] == "General Sector — Revenue" for r in uk))


if __name__ == "__main__":
    unittest.main()
