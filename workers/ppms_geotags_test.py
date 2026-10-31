import unittest
from ppms_geotags import parse_geotags

HTML = '<h6>OD/1/2/3</h6><h5>After</h5><div class="item"><img src="https://ppms.odisha.gov.in/upload/statusimage/example.jpg"><ul><li>Date :10-02-2026</li><li>Latitude - 20.7687 , Longitude - 83.4409</li><li>Status :Approved</li></ul></div>'


class GeotagTests(unittest.TestCase):
    def test_source_approval_not_independent_verification(self):
        rows = parse_geotags(HTML, "OD/1/2/3")
        self.assertEqual(rows[0]["sourceStatus"], "Approved")
        self.assertFalse(rows[0]["independentlyVerified"])
        self.assertEqual(rows[0]["stage"], "after")

    def test_project_mismatch_rejected(self):
        with self.assertRaises(ValueError):
            parse_geotags(HTML, "OD/1/2/4")

    def test_invalid_location_rejected(self):
        with self.assertRaises(ValueError):
            parse_geotags(HTML.replace("20.7687", "120.7687"), "OD/1/2/3")


if __name__ == "__main__":
    unittest.main()
