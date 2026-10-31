import unittest
from first_dot_district_recovery import propose


class DistrictRecoveryTest(unittest.TestCase):
    def candidate(self, state="Keralam", district="Alappuzha"):
        return {
            "id": "test",
            "state": state,
            "district": district,
            "stages": [
                {
                    "receipts": [
                        {
                            "url": "https://example.gov.in/report",
                            "documentHash": "a" * 64,
                            "locator": "row 1",
                        }
                    ]
                }
            ],
        }

    def test_documented_state_name_keeps_proposal_unapproved(self):
        result = propose(
            self.candidate(), {("kerala", "alappuzha"): ["district:554"]}, "registry-hash"
        )
        self.assertEqual(result["areaId"], "district:554")
        self.assertFalse(result["approved"])
        self.assertFalse(result["actualSiteVerified"])
        self.assertFalse(result["paymentLinked"])

    def test_ambiguous_identity_is_not_recovered(self):
        self.assertIsNone(
            propose(
                self.candidate(), {("kerala", "alappuzha"): ["district:1", "district:2"]}, "hash"
            )
        )

    def test_district_similarity_does_not_create_a_match(self):
        self.assertIsNone(
            propose(
                self.candidate(district="Alappuzha Rural"),
                {("kerala", "alappuzha"): ["district:554"]},
                "hash",
            )
        )

    def test_undocumented_state_alias_is_rejected(self):
        self.assertIsNone(
            propose(
                self.candidate(state="Kerala Region"),
                {("kerala", "alappuzha"): ["district:554"]},
                "hash",
            )
        )

    def test_existing_exact_match_is_not_added(self):
        self.assertIsNone(
            propose(
                self.candidate(state="Kerala"), {("kerala", "alappuzha"): ["district:554"]}, "hash"
            )
        )


if __name__ == "__main__":
    unittest.main()
