import unittest
from lgd_registry import code, extract, match, HEADERS


class LGDTests(unittest.TestCase):
    def rows(self, items):
        return [("All Districts of India", None, None, None, None, None, None), HEADERS] + items

    def test_codes_and_provenance(self):
        states, districts = extract(self.rows([(1, 35.0, "State", 603.0, "District", 0, 0)]))
        self.assertEqual(districts[0]["id"], "district:603")
        self.assertEqual(districts[0]["row"], 3)
        self.assertEqual(states[0]["code"], "35")

    def test_duplicates_and_fractional_codes_rejected(self):
        with self.assertRaises(ValueError):
            code(3.5)
        with self.assertRaises(ValueError):
            extract(
                self.rows(
                    [(1, 35, "State", 603, "District", 0, 0), (2, 36, "Other", 603, "Other", 0, 0)]
                )
            )

    def test_matching_never_guesses_renames_or_ambiguity(self):
        self.assertIsNone(
            match("State", "Old District", {("state", "new district"): ["district:1"]})
        )
        self.assertIsNone(
            match("State", "District", {("state", "district"): ["district:1", "district:2"]})
        )
        self.assertEqual(
            match(" STATE ", "District", {("state", "district"): ["district:1"]}), "district:1"
        )
