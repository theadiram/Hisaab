import unittest
from pmgsy_national import assess


class NationalReportTests(unittest.TestCase):
    def row(self, work=1, year=2025):
        return {
            "MAST_STATE_CODE": 14,
            "IMS_PR_ROAD_CODE": work,
            "IMS_ROAD_NAME": "Disposable road",
            "MAST_DISTRICT_NAME": "Disposable district",
            "MAST_DISTRICT_CODE": 83,
            "IMS_YEAR": year,
        }

    def test_duplicates_and_conflicts_do_not_inflate_unique_count(self):
        a = self.row()
        b = dict(a, IMS_ROAD_NAME="Changed road")
        r = assess([a, a, b, self.row(2, 2010)], 14)
        self.assertEqual(r["uniqueSourceWorks"], 2)
        self.assertEqual(r["duplicateRows"], 2)
        self.assertEqual(r["conflictingIdentities"], 1)
        self.assertEqual(r["withinYearWindow"], 1)

    def test_partition_mismatch_is_rejected(self):
        with self.assertRaises(ValueError):
            assess([self.row()], 15)

    def test_incomplete_identity_is_quarantined_without_losing_valid_rows(self):
        result = assess([self.row(), dict(self.row(), IMS_PR_ROAD_CODE=None)], 14)
        self.assertEqual(result["uniqueSourceWorks"], 1)
        self.assertEqual(result["quarantinedRows"], 1)


if __name__ == "__main__":
    unittest.main()
