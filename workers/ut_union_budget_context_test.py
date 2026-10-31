import unittest
from ut_union_budget_context import DEMANDS, extract


class UnionUTBudgetContextTests(unittest.TestCase):
    def inventory(self, total="3.00"):
        rows = []
        for demand in DEMANDS:
            rows.append(
                {
                    "demandNumber": demand,
                    "rawText": f"Grand Total 1.00 2.00 3.00 1.00 2.00 3.00 1.00 2.00 3.00 1.00 2.00 {total}",
                    "sourceHash": "abc",
                    "sourceUrl": "https://indiabudget.gov.in/doc/eb/allsbe.pdf",
                    "page": 1,
                    "line": demand,
                }
            )
        return {"rows": rows}

    def test_keeps_all_eight_ut_demands_and_transfer_scope_explicit(self):
        rows = extract(self.inventory(), "2026-2027")
        self.assertEqual(len(rows), 8)
        self.assertEqual(sum(r["scopeType"] == "transfer_demand" for r in rows), 3)
        self.assertTrue(all(r["status"] == "private_candidate_pending_review" for r in rows))
        self.assertTrue(all(r["classification"] == "unclassified_for_development" for r in rows))
        self.assertEqual(next(r for r in rows if r["jurisdiction"] == "Delhi")["demandNumber"], 57)

    def test_rejects_failed_revenue_capital_total_control(self):
        with self.assertRaisesRegex(ValueError, "does not match"):
            extract(self.inventory(total="4.00"), "2026-2027")

    def test_keeps_blank_capital_unknown(self):
        rows = self.inventory()
        for row in rows["rows"]:
            row["rawText"] = (
                "Grand Total 1.00 2.00 3.00 1.00 2.00 3.00 1.00 2.00 3.00 1.00 ... 1.00"
            )
        result = extract(rows, "2026-2027")
        self.assertTrue(all(r["capital"] is None for r in result))
        self.assertTrue(all(r["reportedTotal"] == "1.00" for r in result))


if __name__ == "__main__":
    unittest.main()
