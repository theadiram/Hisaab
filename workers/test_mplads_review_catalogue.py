import unittest
from mplads_review_catalogue import safe_row


class PrivateCatalogueTests(unittest.TestCase):
    def test_preserves_exact_amounts_and_source_status_without_banking_or_approval(self):
        r = {
            "sourceReportedDisbursedRupees": "1234.50",
            "expenditureDate": "2026-01-02",
            "vendorLabel": "Agency",
            "sourcePaymentStatus": "Payment Success",
            "encodingIssue": False,
            "sourceRowNumber": 7,
            "bankAccount": "excluded",
            "approved": True,
            "settlementVerified": True,
        }
        result = safe_row(r, "hash")
        self.assertEqual(result["amount"], "1234.50")
        self.assertNotIn("bankAccount", result)
        self.assertIsNone(result["transactionId"])
        self.assertFalse(result["approved"])
        self.assertFalse(result["settlementVerified"])
