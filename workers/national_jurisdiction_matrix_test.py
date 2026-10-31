import unittest
from national_jurisdiction_matrix import build
from jurisdiction_procurement_sources import PORTALS, source_for, validate_scope


def mplads_report():
    return {
        "states": [
            {"name": name, "rows": 0}
            for name, _ in __import__("national_jurisdiction_matrix").JURISDICTIONS
        ]
    }


class NationalJurisdictionMatrixTests(unittest.TestCase):
    def test_official_procurement_directory_maps_all_36_jurisdictions(self):
        scope = validate_scope()
        self.assertEqual(scope["expected"], 36)
        self.assertEqual(scope["mapped"], 36)
        self.assertEqual(scope["missing"], [])
        self.assertEqual(
            source_for("Andaman and Nicobar Islands")["portals"][0]["directoryStatus"],
            "epublishing_only",
        )
        self.assertEqual(len(PORTALS["Dadra and Nagar Haveli and Daman and Diu"]), 2)
        self.assertFalse(source_for("Delhi")["paymentEvidence"])

    def test_full_scope_and_missing_partition_are_not_misread_as_zero(self):
        state = {
            "states": [
                {
                    "name": "Kerala",
                    "budgetCandidates": 2,
                    "expenditureCandidates": 1,
                    "projectCandidates": 0,
                    "completeCoverage": False,
                }
            ]
        }
        pmgsy = {
            "statePartitions": [
                {
                    "state": "Keralam",
                    "status": "original_preserved",
                    "sourceRows": 4,
                    "normalizedCandidates": 3,
                }
            ]
        }
        report = mplads_report()
        measure = {"records": [{"jurisdiction": "Kerala", "type": "state"}]}
        rural = {"mgnregsReleases": measure, "mgnregsWaterWorks": measure, "vbGramG": measure}
        empty = {"rows": []}
        data = build(state, pmgsy, report, report, rural, empty, empty)
        self.assertEqual(data["jurisdictionCount"], 36)
        self.assertEqual(data["completeJurisdictions"], 0)
        kerala = next(x for x in data["matrix"] if x["jurisdiction"] == "Kerala")
        self.assertEqual(kerala["pmgsy"]["candidateWorks"], 3)
        self.assertFalse(kerala["pmgsy"]["isPaymentEvidence"])
        chandigarh = next(x for x in data["matrix"] if x["jurisdiction"] == "Chandigarh")
        self.assertEqual(chandigarh["pmgsy"]["status"], "not_in_source_partition")
        self.assertIsNone(chandigarh["pmgsy"]["sourceRows"])
        self.assertEqual(chandigarh["completeProjectPaymentCards"], 0)

    def test_ut_demands_remain_distinct_from_state_budget_and_payment_claims(self):
        report = mplads_report()
        rural = {k: {"records": []} for k in ("mgnregsReleases", "mgnregsWaterWorks", "vbGramG")}
        inventory25 = {"rows": [{"demandNumber": 53}, {"demandNumber": 53}, {"demandNumber": 57}]}
        inventory26 = {"rows": [{"demandNumber": 53}, {"demandNumber": 57}]}
        data = build(
            {"states": []}, {"statePartitions": []}, report, report, rural, inventory25, inventory26
        )
        chandigarh = next(x for x in data["matrix"] if x["jurisdiction"] == "Chandigarh")
        self.assertEqual(chandigarh["stateBudget"]["status"], "not_in_28_state_budget_register")
        self.assertEqual(
            chandigarh["unionBudgetUtDemand"]["fiscalRowCandidates"], {"2025-26": 2, "2026-27": 1}
        )
        self.assertIn("not a complete UT budget", chandigarh["unionBudgetUtDemand"]["scope"])
        delhi = next(x for x in data["matrix"] if x["jurisdiction"] == "Delhi")
        self.assertEqual(delhi["unionBudgetUtDemand"]["demandNumber"], 57)
        self.assertEqual(delhi["completeProjectPaymentCards"], 0)


if __name__ == "__main__":
    unittest.main()
