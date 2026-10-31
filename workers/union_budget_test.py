import unittest
from union_budget import amount, parse_demand, parse_summary


class UnionBudgetTests(unittest.TestCase):
    def fixture(self):
        rows = [[None] * 13 for _ in range(14)]
        rows[5][0] = "Ministry of Railways\nDemand No. 85\nMinistry of Railways"
        rows[6][0] = "(In ₹ Crores)"
        for p, name in enumerate(
            [
                "Actuals 2024-2025",
                "Budget Estimates 2025-2026",
                "Revised Estimates 2025-2026",
                "Budget Estimates 2026-2027",
            ]
        ):
            rows[7][1 + p * 3] = name
            rows[8][1 + p * 3 : 4 + p * 3] = ["Revenue", "Capital", "Total"]
            rows[12][1 + p * 3 : 4 + p * 3] = [1, 2, 3]
        rows[12][0] = "Net"
        rows[13][0] = "A. The Budget allocations, net of recoveries are given below:"
        return (
            rows,
            {"department": "Ministry of Railways", "values": ["1.00", "2.00", "3.00"]},
            {"values": ["1.00", "2.00", "3.00"] * 4, "page": 10},
        )

    def test_exact_amounts_and_unspecified_values(self):
        self.assertEqual(amount("1,234.56"), "1234.56")
        self.assertIsNone(amount("..."))
        self.assertEqual(amount(0), "0.00")
        for bad in [None, True, "=SUM(A1:B1)", "NaN", "1.001"]:
            with self.assertRaises((ValueError, ArithmeticError)):
                amount(bad)

    def test_periods_and_budget_not_payment(self):
        rows, s, p = self.fixture()
        records = parse_demand(rows, 85, s, p)
        self.assertEqual(len(records), 4)
        self.assertEqual(records[0]["measure"], "actual")
        self.assertEqual(records[-1]["financialYear"], "2026-2027")
        self.assertTrue(
            all(
                r["workPayment"] is False and r["workId"] is None and r["location"] is None
                for r in records
            )
        )

    def test_authoritative_pdf_mismatch_and_header_change(self):
        rows, s, p = self.fixture()
        p["values"][0] = "9.00"
        with self.assertRaises(ValueError):
            parse_demand(rows, 85, s, p)
        rows, s, p = self.fixture()
        rows[8][1] = "Capital"
        with self.assertRaises(ValueError):
            parse_demand(rows, 85, s, p)

    def test_ellipsis_not_silently_zeroed(self):
        rows, s, p = self.fixture()
        for i in range(4):
            rows[12][1 + i * 3 : 4 + i * 3] = ["...", 2, 2]
        s["values"] = ["0.00", "2.00", "2.00"]
        p["values"] = [None, "2.00", "2.00"] * 4
        r = parse_demand(rows, 85, s, p)
        self.assertIsNone(r[0]["revenueCrore"])
        self.assertIn("ellipsis", r[0]["notationNote"])

    def test_summary_excludes_parent_totals_and_requires_complete_edition(self):
        rows = [(None, "(In ₹ Crores)"), (None, "Ministry parent", None, 102, 204, 306, "")] + [
            (None, f"{i}. ", "Department " + str(i), 1, 2, 3, "1-2") for i in range(1, 103)
        ]
        self.assertEqual(len(parse_summary(rows)), 102)
        with self.assertRaises(ValueError):
            parse_summary(rows[:-1])
        with self.assertRaises(ValueError):
            parse_summary(rows + [rows[-1]])
