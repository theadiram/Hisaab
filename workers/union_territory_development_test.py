import unittest
from union_territory_development import TERRITORIES, project_rows, budget_rows


class UnionTerritoryDevelopmentTests(unittest.TestCase):
    def test_exactly_eight_current_territories_and_unique_codes(self):
        self.assertEqual(len(TERRITORIES), 8)
        self.assertEqual(len({code for code, _ in TERRITORIES}), 8)
        self.assertIn(("26", "Dadra and Nagar Haveli and Daman and Diu"), TERRITORIES)

    def master(self, name="Jammu & Kashmir (RO- Jammu)", status="Ongoing", completed=""):
        row = [""] * 20
        row[0] = "1"
        row[1] = name
        row[3] = "DN/TEST/JK"
        row[4] = status
        row[5] = "Construction of a bridge"
        row[9] = "12.34"
        row[10] = "10.00"
        row[11] = "01/05/2025"
        row[17] = completed
        row[18] = "Example Limited"
        row[19] = "private@example.invalid"
        return {
            "source": {
                "sha256": "a" * 64,
                "url": "https://example.gov.in/source.pdf",
                "retrievedAt": "2026-10-15",
            },
            "tables": [[["header"] * 20, row]],
        }

    def test_recovers_both_jk_regions_without_inventing_payments_year_or_sites(self):
        for name in ["Jammu & Kashmir (RO- Jammu)", "Jammu & Kashmir (RO- Srinagar)"]:
            row = project_rows(self.master(name))[0]
            self.assertEqual(row["stateCode"], "1")
            self.assertEqual(row["contractAmountRupees"], "100000000.00")
            self.assertIsNone(row["paymentAmountRupees"])
            self.assertIsNone(row["location"])
            self.assertIsNone(row["financialYear"])
            self.assertNotIn("private@example.invalid", str(row))

    def test_excludes_older_completed_works_and_quarantines_duplicate_identifiers(self):
        self.assertEqual(project_rows(self.master(status="Completed", completed="01/04/2024")), [])
        master = self.master()
        master["tables"][0].append(master["tables"][0][1][:])
        with self.assertRaisesRegex(ValueError, "duplicate UT UPN"):
            project_rows(master)

    def test_unknown_transfer_components_stay_unknown_and_context_stays_unapproved(self):
        context = {
            "records": [
                {
                    "jurisdiction": "Delhi",
                    "sourceHash": "a" * 64,
                    "demandNumber": 57,
                    "financialYear": "2026-2027",
                    "scopeType": "transfer_demand",
                    "reportedTotal": "100.00",
                    "revenue": "100.00",
                    "capital": None,
                    "sourceUrl": "https://example.gov.in/budget.pdf",
                    "locator": "Page 1",
                    "warning": "Transfer only; not local expenditure.",
                }
            ]
        }
        row = budget_rows(context, "7", "Delhi")[0]
        self.assertEqual(row["amountRupees"], "1000000000.00")
        self.assertIsNone(row["capitalRupees"])
        self.assertEqual(row["classification"], "broad_financial_context")
        self.assertFalse(row["publicationApproved"])


if __name__ == "__main__":
    unittest.main()
