import unittest

from state_development_card_readiness import audit_project, audit_state


class CardReadinessTests(unittest.TestCase):
    def test_budget_or_tender_amount_does_not_fill_payment_fields(self):
        row = {
            "id": "x",
            "sourceProjectId": "tender-1",
            "title": "Road work",
            "contractAmountRupees": "100",
            "source": {"url": "https://example.test", "locator": "row 1"},
        }
        audited = audit_project(row)
        self.assertFalse(audited["completeFinancialWorkCard"])
        self.assertIn("paymentAmountRupees", audited["missingFields"])
        self.assertIn("location", audited["missingFields"])
        self.assertFalse(audited["publicationApproved"])

    def test_only_explicit_same_row_fields_count(self):
        row = {
            "id": "x",
            "sourceProjectId": "work-1",
            "title": "School",
            "location": "Village A",
            "sanctionAmountRupees": "120",
            "sanctionDate": "2025-01-02",
            "contractAmountRupees": "110",
            "awardDate": "2025-02-03",
            "contractorName": "Firm X",
            "paymentAmountRupees": "50",
            "paymentDate": "2025-03-04",
            "completionCertificateSource": "https://example.test/certificate",
            "source": {"url": "https://example.test", "locator": "page 1, row 1"},
        }
        audited = audit_project(row)
        self.assertTrue(audited["completeFinancialWorkCard"])
        self.assertEqual(audited["missingFields"], [])
        report = audit_state("11", "Sikkim", [row])
        self.assertEqual(report["completeFinancialWorkCards"], 1)
        self.assertFalse(report["publicationApproved"])


if __name__ == "__main__":
    unittest.main()
