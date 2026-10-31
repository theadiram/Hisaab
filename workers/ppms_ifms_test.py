import unittest
from ppms_ifms import parse


class ParserTests(unittest.TestCase):
    def test_footer_not_payment_and_failed_status_preserved(self):
        rows = parse(
            '<table id="exportTable"><tr><th>Project Code</th><th>Status</th><th>Amount</th></tr><tr><td>P1</td><td>Failed</td><td>0</td></tr><tr><td colspan="2">TOTAL</td><td>0</td></tr></table>'
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["Status"], "Failed")

    def test_column_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            parse(
                '<table id="exportTable"><tr><th>Code</th><th>Status</th></tr><tr><td>P1</td></tr></table>'
            )


if __name__ == "__main__":
    unittest.main()
