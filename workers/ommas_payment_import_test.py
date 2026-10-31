import unittest, csv, io
from ommas_payment_import import extract


class BankPaymentTests(unittest.TestCase):
    def report(self, amounts=("100.10",), date="01/10/2026"):
        fields = [
            "admin_nd_name",
            "SRRDA",
            "BILL_NO",
            "BILL_DATE",
            "CHQ_NO",
            "CHQ_AMOUNT",
            "PAYMENT_REQ_FILENAME",
            "Bank_Ack_Status",
            "BANK_ACK_TXNDATE",
            "BANK_ACK_INSTRID",
        ]
        f = io.StringIO()
        w = csv.DictWriter(f, fields)
        w.writeheader()
        for amount in amounts:
            w.writerow(
                dict(
                    zip(
                        fields,
                        [
                            "DPIU Test",
                            "Source agency",
                            "V1",
                            date,
                            "ePay/TEST/1",
                            amount,
                            "file.xml",
                            "Accepted",
                            date,
                            "unneeded-bank-id",
                        ],
                    )
                )
            )
        return f.getvalue().encode()

    def test_preserves_rupee_amount_and_separate_bank_date_without_project_inference(self):
        rows, dups, bad = extract(self.report())
        self.assertEqual(rows[0]["chequeAmount"], "100.10")
        self.assertEqual(rows[0]["bankReportedTransactionDate"], "2026-10-01")
        self.assertIsNone(rows[0]["projectId"])
        self.assertNotIn("BANK_ACK_INSTRID", rows[0])
        self.assertFalse(rows[0]["approved"])
        self.assertEqual(bad, [])

    def test_duplicate_mirror_not_double_counted(self):
        rows, dups, bad = extract(self.report(("100.10", "100.10")))
        self.assertEqual(len(rows), 1)
        self.assertEqual(dups, 1)

    def test_conflicting_versions_exclude_every_version(self):
        rows, dups, bad = extract(self.report(("100.10", "200.10")))
        self.assertEqual(rows, [])
        self.assertTrue(bad)

    def test_fractional_paise_and_invalid_dates_quarantined(self):
        self.assertEqual(extract(self.report(("0.001",)))[0], [])
        self.assertEqual(extract(self.report(date="invalid"))[0], [])


if __name__ == "__main__":
    unittest.main()
