import unittest

from puducherry_monthly_accounts import extract_pages


class PuducherryMonthlyAccountsTests(unittest.TestCase):
    def test_indexes_voucher_locators_without_claiming_settlement_or_project_link(self):
        rows = extract_pages(
            [
                """Print Date : 03/09/2026 Page: 1
GOVERNMENT OF PUDUCHERRY
Compilation Report for the period from 01/08/2026 to 31/08/2026
Unit : 01
Head of Account : 20 4059 00 051 01 00 Public Works,Construction
Vr.No. Vr. Date Token No. Payment Obj Gross. Recoveries Net Amount
5 11/08/2026 142029 40000 00 40000 0 40000
0 - 40000 -
"""
            ]
        )
        self.assertEqual(len(rows), 1)
        row = rows[0]
        self.assertEqual(row["page"], 1)
        self.assertEqual(row["line"], 7)
        self.assertEqual(row["unit"], "01")
        self.assertEqual(row["voucherDate"], "11/08/2026")
        self.assertEqual(row["tokenNumber"], "142029")
        self.assertEqual(row["rawLine"], "5 11/08/2026 142029 40000 00 40000 0 40000")
        self.assertFalse(row["projectLinked"])
        self.assertFalse(row["settlementVerified"])
        self.assertIsNone(row["developmentClassification"])

    def test_rejects_impossible_voucher_date(self):
        with self.assertRaises(ValueError):
            extract_pages(["Unit : 01\nHead of Account : Test\n1 32/13/2026 123 100 0 100 100"])


if __name__ == "__main__":
    unittest.main()
