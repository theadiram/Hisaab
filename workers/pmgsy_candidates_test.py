import unittest
from pmgsy_candidates import extract, source_date


class CandidateTests(unittest.TestCase):
    def manifest(self):
        return {
            "sourceId": "pmgsy-dashboard",
            "sha256": "a" * 64,
            "url": "https://example.invalid/report",
            "query": {"StateID": 14},
            "retrievedAt": "2026-10-06T00:00:00Z",
        }

    def row(self):
        return {
            "IMS_PR_ROAD_CODE": 10,
            "IMS_ROAD_NAME": "Disposable road",
            "MAST_STATE_NAME": "Test state",
            "MAST_DISTRICT_NAME": "Test district",
            "IMS_YEAR": 2025,
            "IMS_PACKAGE_ID": "TEST",
            "IMS_SANCTIONED_DATE": "/Date(1735689600000)/",
            "TOTAL_SANCTIONED_COST": 12.5,
            "TEND_AGREEMENT_NUMBER": None,
            "WORK_STATUS": "Completed",
        }

    def test_units_and_current_geography_are_not_invented(self):
        result = extract(self.manifest(), [self.row()])
        work = result["candidates"][0]
        self.assertEqual(work["money"], [])
        self.assertIsNone(work["stages"][0]["amount"])
        self.assertEqual(work["areaId"], "")
        self.assertEqual(work["stages"][3]["state"], "inaccessible")
        self.assertEqual(work["financialYear"], "2025")

    def test_conflicting_source_copies_are_quarantined_together(self):
        a = self.row()
        result = extract(self.manifest(), [a, dict(a, IMS_ROAD_NAME="Changed road")])
        self.assertEqual(result["candidates"], [])
        self.assertEqual(len(result["quarantine"]), 2)

    def test_microsoft_dates_are_explicitly_decoded(self):
        self.assertEqual(source_date("/Date(1735689600000)/"), "2025-01-01")
        with self.assertRaises(ValueError):
            source_date("January 2025")


if __name__ == "__main__":
    unittest.main()
