import copy
import unittest
from mopr_scheme_finance import DATA, validate
import json


@unittest.skipUnless(
    DATA.exists(), "Private source-acquisition fixtures are not included in the public checkout"
)
class MoPRSchemeFinanceTest(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(DATA.read_text())

    def test_original_and_all_printed_controls(self):
        result = validate(self.data)
        self.assertTrue(result["sourceHashVerified"])
        self.assertEqual(result["periods"], 13)
        self.assertEqual(result["stateAllocatedAmounts"], 0)
        self.assertEqual(result["projectPayments"], 0)

    def test_merged_2025_26_re_cell_is_not_assigned_to_a_scheme(self):
        row = next(
            p
            for p in self.data["periods"]
            if p["financialYear"] == "2025-2026" and p["measure"] == "revised"
        )
        self.assertEqual(row["mergedSourceCells"][0]["amountCrore"], "772.30")
        self.assertEqual(row["mergedSourceCells"][0]["programs"], ["RGSA", "Nirbhaya Fund"])
        self.assertIsNone(
            next(x for x in row["schemeComponents"] if x["program"].endswith("(RGSA)"))[
                "amountCrore"
            ]
        )
        self.assertIsNone(
            next(x for x in row["schemeComponents"] if x["program"] == "Nirbhaya Fund")[
                "amountCrore"
            ]
        )

    def test_does_not_claim_states_or_publication(self):
        altered = copy.deepcopy(self.data)
        altered["geographicScope"] = "State level"
        with self.assertRaises(ValueError):
            validate(altered)
        altered = copy.deepcopy(self.data)
        altered["publicationApproved"] = True
        with self.assertRaises(ValueError):
            validate(altered)


if __name__ == "__main__":
    unittest.main()
