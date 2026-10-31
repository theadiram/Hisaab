import unittest
from ppms_location_collection import candidates


class LocationCollectionTests(unittest.TestCase):
    def dossier(self):
        return dict(
            projectCode="OD/1",
            projectConflict=False,
            project={
                "Project Code": "OD/1",
                "sourceLinks": [
                    "https://ppms.odisha.gov.in/report/geo-tagging-status-detail/observed"
                ],
            },
            bills=[{"Project Code": "OD/1"}],
        )

    def test_conflict_and_external_links_not_collected(self):
        d = self.dossier()
        d["project"]["sourceLinks"].append(
            "https://example.com/report/geo-tagging-status-detail/fake"
        )
        self.assertEqual(len(candidates([d])), 1)
        d["projectConflict"] = True
        self.assertEqual(candidates([d]), [])

    def test_mismatched_bill_cannot_supply_location(self):
        d = self.dossier()
        d["bills"][0]["Project Code"] = "OD/2"
        with self.assertRaises(ValueError):
            candidates([d])

    def test_mismatched_project_rejected(self):
        d = self.dossier()
        d["project"]["Project Code"] = "OD/2"
        with self.assertRaises(ValueError):
            candidates([d])


if __name__ == "__main__":
    unittest.main()
