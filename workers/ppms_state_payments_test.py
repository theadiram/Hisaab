import unittest
from ppms_state_payments import conflicting_bill_keys


class ConflictingBillsTest(unittest.TestCase):
    def test_differing_editions_quarantine_bill_serial_without_promoting_newer_page(self):
        catalogue = {"conflicts": [{"identity": ["project-a", "serial-a", "Final Bill"]}]}
        keys = conflicting_bill_keys(catalogue)
        self.assertIn(("project-a", "serial-a"), keys)
        self.assertNotIn(("project-a", "serial-b"), keys)

    def test_no_conflicts_is_not_a_publication_approval(self):
        self.assertEqual(conflicting_bill_keys({}), set())
