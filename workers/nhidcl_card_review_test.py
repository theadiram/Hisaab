import unittest
from nhidcl_card_review import review_rows


class NHIDCLCardReviewTests(unittest.TestCase):
    def fixture(self):
        header = [""] * 20
        header[3] = "PMP\n(UPN- ID)"
        header[9] = "TPC\n(in Crore)"
        header[10] = "Awarded\nCost\n(in Cr.)"
        row = [""] * 20
        row[0] = "1"
        row[3] = "DN/TEST/AS"
        row[4] = "Ongoing"
        row[5] = "Construction of a road"
        row[9] = "12.34"
        row[10] = "10.00"
        row[11] = "01/05/2025"
        row[18] = "Example Road Limited"
        row[19] = "private-contact@example.invalid"
        source = {"sha256": "a" * 64, "url": "https://example.gov.in/source.pdf"}
        candidate = {
            "id": "one",
            "stateCode": "18",
            "sourceProjectId": row[3],
            "projectIdBasis": "official_pmp_upn",
            "title": row[5],
            "stage": row[4],
            "projectCostRupees": "123400000.00",
            "contractAmountRupees": "100000000.00",
            "contractorName": row[18],
            "awardDate": "2025-05-01",
            "reportedCompletionDate": None,
            "source": {"sha256": source["sha256"]},
        }
        return [header, row], candidate, source

    def test_original_matching_prioritizes_contract_facts_without_approving_payment_or_leaking_contacts(
        self,
    ):
        table, candidate, source = self.fixture()
        row = review_rows(table, [candidate], source)[0]
        self.assertEqual(row["reviewPriority"], "contract_facts_first")
        self.assertFalse(row["publicationApproved"])
        self.assertFalse(row["paymentEvidenceVerified"])
        self.assertFalse(row["locationEvidenceVerified"])
        self.assertNotIn("private-contact", str(row))

    def test_conflicting_candidate_amount_or_edition_rejects_review(self):
        table, candidate, source = self.fixture()
        with self.assertRaisesRegex(ValueError, "differ from original"):
            review_rows(table, [{**candidate, "contractAmountRupees": "1000000000.00"}], source)
        with self.assertRaisesRegex(ValueError, "different original edition"):
            review_rows(table, [{**candidate, "source": {"sha256": "b" * 64}}], source)
        with self.assertRaisesRegex(ValueError, "contractor differs"):
            review_rows(table, [{**candidate, "contractorName": "Different contractor"}], source)

    def test_changed_unit_and_duplicate_id_fail(self):
        table, candidate, source = self.fixture()
        table[0][9] = "TPC (in Lakh)"
        with self.assertRaisesRegex(ValueError, "headings or units"):
            review_rows(table, [candidate], source)
        table, candidate, source = self.fixture()
        table.append(table[1][:])
        with self.assertRaisesRegex(ValueError, "repeated original UPN"):
            review_rows(table, [candidate], source)

    def test_names_starting_with_na_are_not_treated_as_na_placeholders(self):
        table, candidate, source = self.fixture()
        table[1][18] = "Naresh Infrastructure"
        candidate["contractorName"] = table[1][18]
        row = review_rows(table, [candidate], source)[0]
        self.assertTrue(row["fieldChecks"]["namedContractor"])
        self.assertEqual(row["checkedFacts"]["contractorName"], "Naresh Infrastructure")

    def test_terminated_zero_contract_or_missing_date_stays_lower_priority(self):
        table, candidate, source = self.fixture()
        table[1][4] = "Terminated"
        candidate["stage"] = "Terminated"
        self.assertEqual(
            review_rows(table, [candidate], source)[0]["reviewPriority"], "resolve_source_gaps"
        )
        table, candidate, source = self.fixture()
        table[1][10] = "0.00"
        candidate["contractAmountRupees"] = "0.00"
        self.assertEqual(
            review_rows(table, [candidate], source)[0]["reviewPriority"], "resolve_source_gaps"
        )
        table, candidate, source = self.fixture()
        table[1][11] = "Not awarded"
        candidate["awardDate"] = None
        self.assertEqual(
            review_rows(table, [candidate], source)[0]["reviewPriority"], "resolve_source_gaps"
        )


if __name__ == "__main__":
    unittest.main()
