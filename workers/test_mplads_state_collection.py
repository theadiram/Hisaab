import unittest
from mplads_state_collection import request_body, validate_scope


class HouseScopeTests(unittest.TestCase):
    def test_house_request_does_not_reuse_lok_scope(self):
        self.assertEqual(request_body(25, 1)["combo"], "25,0,0,1")
        self.assertEqual(request_body(25, 2)["combo"], "25,0,0,2")
        with self.assertRaises(ValueError):
            request_body(25, 0)

    def test_wrong_house_state_or_missing_house_rejected(self):
        validate_scope([{"state": "Odisha", "house": 1}], "Odisha", 1)
        for row in [
            {"state": "Odisha", "house": 2},
            {"state": "Other", "house": 1},
            {"state": "Odisha", "house": None},
        ]:
            with self.assertRaises(ValueError):
                validate_scope([row], "Odisha", 1)


if __name__ == "__main__":
    unittest.main()
