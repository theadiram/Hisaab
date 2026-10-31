import unittest

from ut_union_budget_lines import DEMANDS, extract


class UnionUTBudgetLineTests(unittest.TestCase):
    def test_preserves_raw_lines_for_all_eight_demands_and_both_editions(self):
        inventories = []
        for year in ("2025-2026", "2026-2027"):
            rows = []
            for demand in DEMANDS:
                rows.extend(
                    [
                        {
                            "id": f"{year}-{demand}-1",
                            "demandNumber": demand,
                            "page": 10,
                            "line": 1,
                            "rawText": "Grand Total 1,000.00",
                            "sourceHash": "sha256:test",
                            "sourceUrl": "https://www.indiabudget.gov.in/doc/eb/allsbe.pdf",
                        },
                        {
                            "id": f"{year}-{demand}-2",
                            "demandNumber": demand,
                            "page": 10,
                            "line": 2,
                            "rawText": "3.01 Education programme 100.00",
                            "sourceHash": "sha256:test",
                            "sourceUrl": "https://www.indiabudget.gov.in/doc/eb/allsbe.pdf",
                        },
                    ]
                )
            inventories.append((year, {"rows": rows}))

        result = extract(inventories)
        self.assertEqual(len(result), 8 * 2 * 2)
        self.assertEqual({row["demandNumber"] for row in result}, set(DEMANDS))
        self.assertEqual({row["financialYear"] for row in result}, {"2025-2026", "2026-2027"})
        self.assertEqual(result[0]["rawText"], "Grand Total 1,000.00")
        self.assertTrue(
            all(row["reviewStatus"] == "private_unreviewed_source_line" for row in result)
        )
        self.assertTrue(all(row["isDevelopmentAmount"] is None for row in result))
        self.assertTrue(all(row["isPaymentEvidence"] is False for row in result))

    def test_rejects_duplicate_source_rows_instead_of_counting_twice(self):
        row = {
            "id": "same",
            "demandNumber": 52,
            "page": 1,
            "line": 1,
            "rawText": "Gross 10.00",
            "sourceHash": "sha256:test",
            "sourceUrl": "https://www.indiabudget.gov.in/doc/eb/allsbe.pdf",
        }
        with self.assertRaisesRegex(ValueError, "Duplicate source identity"):
            extract([("2026-2027", {"rows": [row, dict(row)]})])


if __name__ == "__main__":
    unittest.main()
