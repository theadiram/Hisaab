import unittest
from wb_jjm_schemes import normalize


class SchemeTest(unittest.TestCase):
    def html(self, cells):
        return (
            'Rs. in Lakh<table id="shorttable5"><tr>'
            + "".join("<td>" + v + "</td>" for v in cells)
            + "</tr></table>"
        )

    def test_source_units_and_ids_do_not_create_payments(self):
        rows = normalize(
            self.html(
                [
                    "1",
                    "DISTRICT",
                    "Scheme TSM/0001 SM/002",
                    "New",
                    "01/01/2023",
                    "1,000.01",
                    "50.00",
                    "30.03",
                    "3",
                    "10",
                ]
            )
        )
        self.assertEqual(rows[0]["reportedExpenditureLakh"], "30.03")
        self.assertEqual(rows[0]["officialSchemeIds"], ["TSM/0001", "SM/002"])
        self.assertEqual(rows[0]["individualPayments"], [])
        self.assertFalse(rows[0]["approved"])

    def test_changed_columns_are_not_silently_dropped(self):
        with self.assertRaises(ValueError):
            normalize(self.html(["1", "district", "scheme TSM/1"]))

    def test_unlabelled_amounts_are_not_assumed_rupees(self):
        with self.assertRaises(ValueError):
            normalize('<table id="shorttable5"></table>')
