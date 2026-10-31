import csv, io, unittest
from ommas_road_financial_import import extract


class FinancialExportTests(unittest.TestCase):
    def report(self, cost="1.234", expenditure="0.56", units="Rs. In Lacs", total="1.234"):
        fields = [
            "Textbox2",
            "Textbox6",
            "Textbox69",
            "Textbox8",
            "Textbox9",
            "Textbox11",
            "Textbox12",
            "Textbox13",
            "DISTRICT_NAME1",
            "PACKAGE_ID1",
            "Textbox70",
            "ROAD_NAME1",
            "CONNECTIVITY",
            "PAVEMENT_LENGTH",
            "SANCTION_COST",
            "EXPENDITURE",
            "PhysicalCompletion",
            "Textbox68",
            "SANCTION_COST1",
            "EXPENDITURE1",
        ]
        row = [
            "District Name",
            "Package Name",
            "Sr.No.",
            "Road/Bridge Name",
            "Category",
            "Length",
            "Sanction Cost (" + units + ")",
            "Expenditure (" + units + ")",
            "Bhadrak",
            "ORTEST",
            "1",
            "Test source road",
            "Upgradation",
            "1.1",
            cost,
            expenditure,
            "Jun 8 2026",
            "Total:",
            total,
            expenditure,
        ]
        text = io.StringIO()
        w = csv.writer(text)
        w.writerows(
            [["Textbox57"], ["State : Odisha Agency : Rural Works Organisation"], [], fields, row]
        )
        return text.getvalue().encode()

    def test_exact_lakh_scale_preserves_three_decimal_source_cost(self):
        r = extract(self.report())[0]
        self.assertEqual(r["sanctionAmount"], "123400.00")
        self.assertEqual(r["reportedExpenditureAmount"], "56000.00")
        self.assertEqual(r["reportedPhysicalCompletionDate"], "2026-06-08")
        self.assertEqual(r["originalSanction"], "1.234")

    def test_missing_currency_units_fail_closed(self):
        with self.assertRaises(ValueError):
            extract(self.report(units="Unknown"))

    def test_mismatched_totals_fail_closed(self):
        with self.assertRaises(ValueError):
            extract(self.report(total="2"))

    def test_fractional_paise_and_negative_amounts_rejected(self):
        for amount in ["0.00000001", "-1"]:
            with self.assertRaises(ValueError):
                extract(self.report(cost=amount, total=amount))

    def test_schema_change_rejected(self):
        with self.assertRaises(ValueError):
            extract(self.report().replace(b"EXPENDITURE,", b"UNRECOGNIZED,"))


if __name__ == "__main__":
    unittest.main()
