import unittest
from ppms_project_dossiers import join


class JoinTests(unittest.TestCase):
    def test_names_cannot_establish_join(self):
        result = join(
            [{"Project Code": "A", "Project Name": "School"}],
            [{"Project Code": "B", "Project Name": "School"}],
        )
        self.assertIsNone(result[0]["project"])
        self.assertFalse(result[0]["approved"])

    def test_exact_identity_keeps_failed_bill(self):
        result = join([{"Project Code": "A"}], [{"Project Code": "A", "Status": "Failed"}])
        self.assertEqual(result[0]["matchBasis"], "Exact PPMS project code")
        self.assertEqual(result[0]["bills"][0]["Status"], "Failed")
        self.assertFalse(result[0]["paymentDatesVerified"])

    def test_conflicting_editions_rejected(self):
        result = join(
            [
                {"Project Code": "A", "Project Name": "One"},
                {"Project Code": "A", "Project Name": "Two"},
            ],
            [{"Project Code": "A"}],
        )
        self.assertTrue(result[0]["projectConflict"])
        self.assertIsNone(result[0]["project"])
        self.assertEqual(len(result[0]["projectEditions"]), 2)


if __name__ == "__main__":
    unittest.main()
