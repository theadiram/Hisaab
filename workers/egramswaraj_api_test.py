import unittest
from egramswaraj_api import assess, index_records


class ApiTests(unittest.TestCase):
    def test_join_only_official_ids(self):
        result = assess(
            {
                "planning": [{"activityCd": 1, "activityName": "Road"}],
                "administrative": [{"activityCd": 2, "activityName": "Road"}],
            }
        )
        self.assertEqual(result["uniqueActivityIds"], 2)
        self.assertEqual(result["paymentLinks"], 0)
        self.assertTrue(
            all(p["exactGeography"] is None and not p["approved"] for p in result["projects"])
        )

    def test_multiple_progress_rows_retained(self):
        self.assertEqual(
            len(index_records([{"activityCd": 1, "stage": 1}, {"activityCd": 1, "stage": 2}])["1"]),
            2,
        )

    def test_missing_id_rejected(self):
        with self.assertRaises(ValueError):
            index_records([{"activityName": "Road"}])

    def test_reported_geotag_is_not_verified_location(self):
        result = assess(
            {
                "physical": [
                    {
                        "activityCd": 1,
                        "physicalProgressAssetStageUploadWebService": [
                            {"latitude": "20.77", "longitude": "83.44", "fileUploadId": 10},
                            {"latitude": "0", "longitude": "0"},
                        ],
                    }
                ]
            }
        )
        self.assertEqual(result["activitiesWithReportedGeotags"], 1)
        self.assertEqual(result["verifiedCoordinates"], 0)
        self.assertEqual(len(result["projects"][0]["reportedGeotags"]), 1)


if __name__ == "__main__":
    unittest.main()
