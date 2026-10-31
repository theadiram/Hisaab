import unittest
from ppms_payment_details import cheque_fields, recipient_rows


class PaymentDetailsTest(unittest.TestCase):
    def test_cheque_date_is_not_settlement(self):
        result = cheque_fields("Cheque Date & No.: 24-02-2026 & 157514 Cheque Amount: 299999.05")
        self.assertEqual(result["chequeAmount"], "299999.05")
        self.assertEqual(result["chequeDate"], "24-02-2026")
        self.assertFalse(result["approved"])
        self.assertIn("not confirmed settlement", result["dateBasis"])

    def test_wrapped_official_labels_preserve_date_and_decimal(self):
        r = cheque_fields("Cheque Date &\nNo.:\n26-09-2025 &\n9841 Cheque Amount: 362184.00")
        self.assertEqual(r["chequeDate"], "26-09-2025")
        self.assertEqual(r["chequeAmount"], "362184.00")

    def test_unlabelled_numbers_do_not_become_payment(self):
        self.assertIsNone(cheque_fields("Final Bill Date: 13-02-2026 Amount 299999.00"))

    def test_explicit_missing_cheque_fields_stay_missing(self):
        result = cheque_fields("Cheque Date & No.: - & Cheque Amount: 455379.00")
        self.assertEqual(result["chequeAmount"], "455379.00")
        self.assertIsNone(result["chequeDate"])
        self.assertIsNone(result["chequeNumber"])
        self.assertFalse(result["approved"])


class RecipientProjectionTest(unittest.TestCase):
    def test_clipped_amounts_do_not_become_validated_recipients(self):
        def word(text, x, top):
            return dict(text=text, x0=x, x1=x + 20, top=top, bottom=top + 10)

        words = [
            word("Beneficiary", 100, 217),
            word("Bank", 180, 217),
            word("Amount", 603, 223),
            word("1", 71, 266),
            word("Agency", 100, 260),
            word("SECRET-ACCOUNT", 300, 266),
            word("100.00", 603, 266),
        ]
        result = recipient_rows(words, 595)
        self.assertTrue(result["layoutClipped"])
        self.assertIsNone(result["recipients"][0]["amount"])
        self.assertNotIn("SECRET", str(result))
