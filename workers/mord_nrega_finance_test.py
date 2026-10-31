import unittest
from decimal import Decimal

from mord_nrega_finance import DATA, RELEASES_ORIGINAL, WATER_ORIGINAL, build, validate


@unittest.skipUnless(
    DATA.exists() and RELEASES_ORIGINAL.exists() and WATER_ORIGINAL.exists(),
    "Private source-acquisition fixtures are not included in the public checkout",
)
class MoRDRuralWorksFinanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = build()

    def test_all_states_and_ut_rows_have_exact_source_controls(self):
        result = validate(self.data)
        self.assertEqual(result["statesPerTable"], 28)
        self.assertEqual(result["jurisdictionsPerTable"], 34)
        self.assertTrue(result["waterAndAllocationControlsExact"])
        self.assertEqual(
            result["mgnregsReleasePrintedDifferencesCrore"],
            {
                "2025-26": "-0.01",
                "2024-25": "-0.01",
                "2023-24": "-0.01",
                "2022-23": "0.03",
                "2021-22": "-0.01",
            },
        )

    def test_missing_source_cell_stays_unknown_and_is_not_zero(self):
        lakshadweep = next(
            row
            for row in self.data["mgnregsWaterWorks"]["records"]
            if row["jurisdiction"] == "Lakshadweep"
        )
        # The source prints a dash for this cell; the parser must not turn it into ₹0.
        self.assertIsNone(lakshadweep["valuesLakhRupees"]["2026-27"])

    def test_scheme_stage_semantics_are_not_promoted_to_payments(self):
        self.assertIn(
            "not state utilisation or contractor payments", self.data["mgnregsReleases"]["basis"]
        )
        self.assertIn("not expenditure or settlement", self.data["vbGramG"]["basis"])
        self.assertFalse(self.data["publicationApproved"])
        self.assertFalse(self.data["settlementVerified"])
        self.assertFalse(self.data["source"]["rightsReviewed"])

    def test_current_programme_transition_periods_are_separate(self):
        self.assertEqual(self.data["mgnregsWaterWorks"]["cutoff"], "2026-06-30")
        self.assertEqual(self.data["vbGramG"]["financialYear"], "2026-27")
        self.assertEqual(self.data["vbGramG"]["asOf"], "2026-07-16")


if __name__ == "__main__":
    unittest.main()
