import unittest
from funding_budget_columns import parse_cells

PERIODS = [
    ("actual", "2014-2015"),
    ("budget_estimate", "2015-2016"),
    ("revised_estimate", "2015-2016"),
    ("budget_estimate", "2016-2017"),
]


class BudgetColumnTests(unittest.TestCase):
    def test_old_plan_nonplan_columns_keep_their_meaning(self):
        r = parse_cells(
            "Programme 1.00 2.00 3.00 4.00 5.00 9.00 6.00 7.00 13.00 8.00 9.00 17.00",
            PERIODS,
            ["plan", "non_plan", "total"],
        )
        self.assertEqual(r["columns"][0]["components"]["non_plan"], "2.00")
        self.assertNotIn("capital", r["columns"][0]["components"])
        self.assertEqual(r["columns"][3]["totalRupees"], "170000000.00")

    def test_unknown_is_not_zero_and_negative_recovery_survives(self):
        r = parse_cells(
            "Recoveries -1.00 ... -1.00 ... ... ... ... ... ... ... ... ...",
            PERIODS,
            ["revenue", "capital", "total"],
        )
        self.assertEqual(r["columns"][0]["totalRupees"], "-10000000.00")
        self.assertIsNone(r["columns"][0]["components"]["capital"])
        self.assertIsNone(r["columns"][1]["totalRupees"])

    def test_bad_components_and_other_layouts_are_not_interpreted(self):
        with self.assertRaises(ValueError):
            parse_cells(
                "Programme 1.00 2.00 4.00 4.00 5.00 9.00 6.00 7.00 13.00 8.00 9.00 17.00",
                PERIODS,
                ["revenue", "capital", "total"],
            )
        self.assertIsNone(
            parse_cells("Other table 1.00 2.00 3.00", PERIODS, ["revenue", "capital", "total"])
        )
        self.assertIsNone(
            parse_cells(
                "Other table 0.50 1.00 2.00 3.00 4.00 5.00 9.00 6.00 7.00 13.00 8.00 9.00 17.00",
                PERIODS,
                ["revenue", "capital", "total"],
            )
        )

    def test_source_precision_is_preserved_in_native_unit(self):
        r = parse_cells(
            "Programme 0.00000001 ... 0.00000001 ... ... ... ... ... ... ... ... ...",
            PERIODS,
            ["revenue", "capital", "total"],
        )
        self.assertEqual(r["columns"][0]["components"]["revenue"], "0.00000001")
        self.assertEqual(r["columns"][0]["totalRupees"], "0.10")


if __name__ == "__main__":
    unittest.main()
