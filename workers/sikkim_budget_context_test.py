import unittest
from sikkim_budget_context import DATA, validate


@unittest.skipUnless(
    DATA.exists(), "Private source-acquisition fixtures are not included in the public checkout"
)
class SikkimBudgetContextTests(unittest.TestCase):
    def test_official_notice_stays_context_not_full_afs_or_payment(self):
        result = validate()
        self.assertTrue(result["sourceHashVerified"])
        self.assertFalse(result["detailedAfsFound"])
        self.assertEqual(result["payments"], 0)


if __name__ == "__main__":
    unittest.main()
