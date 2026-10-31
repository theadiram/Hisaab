import unittest
from egramswaraj_cashbook import parse_rows


def fixture():
    rows = [[""] * 14 for _ in range(9)]
    rows[0][0] = "Sample"
    rows[1][0] = "Closed"
    rows[3][:3] = rows[3][7:10] = ["Date", "Voucher No", "Cheque No"]
    rows[4][3:7] = [0, 0, 100, 0]
    rows[5][7:14] = ["26/03/2026", "XVFC/2025-26/P/35", "", 0, 0, 20, 0]
    rows[6][7] = "Classification: Major Work"
    rows[7][7] = "Particulars: Paid RS 9.00 and RS 10.00 VIDE CR NO 20-2024-25"
    rows[8][10:14] = [0, 0, 80, 0]
    return rows


class CashbookTests(unittest.TestCase):
    def test_retains_conflict_and_missing_approvals(self):
        report = parse_rows(fixture())
        record = report["records"][0]
        self.assertEqual(record["localWorkReference"], "20-2024-25")
        self.assertEqual(record["accountingDate"], "2026-03-26")
        self.assertTrue(record["recipientAmountConflict"])
        self.assertFalse(record["approved"])
        self.assertEqual(record["amountBasis"], "unknown")

    def test_unbalanced_report_rejected(self):
        rows = fixture()
        rows[-1][12] = 81
        with self.assertRaisesRegex(ValueError, "balance"):
            parse_rows(rows)

    def test_duplicate_voucher_rejected(self):
        rows = fixture()
        rows[8:8] = [r.copy() for r in rows[5:8]]
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            parse_rows(rows)

    def test_source_decimals_preserved(self):
        rows = fixture()
        rows[5][12] = 20.01
        rows[-1][12] = 79.99
        self.assertEqual(parse_rows(rows)["reconciliation"]["payments"], "20.01")


if __name__ == "__main__":
    unittest.main()
