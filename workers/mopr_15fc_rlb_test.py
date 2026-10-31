import copy
import unittest

import mopr_15fc_rlb as source


@unittest.skipUnless(
    source.DATA.exists() and source.ORIGINAL.exists(),
    "Private source-acquisition fixtures are not included in the public checkout",
)
class Mopr15FCTest(unittest.TestCase):
    def test_source_and_printed_controls(self):
        result = source.validate()
        self.assertEqual(result["states"], 28)
        self.assertEqual(result["years"], 6)
        self.assertEqual(result["fy2025_26"]["allocationCrore"], "48573.00")
        self.assertEqual(result["fy2025_26"]["releaseCrore"], "39114.77")
        self.assertEqual(len(result["unresolvedPrintedControlDifferences"]), 8)
        self.assertFalse(result["settlementVerified"])
        self.assertFalse(result["publicationApproved"])

    def test_rejects_wrong_state_total(self):
        data = __import__("json").loads(source.DATA.read_text())
        data = copy.deepcopy(data)
        data["states"][0]["total"]["release"] = "1.00"
        with self.assertRaisesRegex(ValueError, "State total mismatch"):
            source.validate(data)

    def test_rejects_promoted_release(self):
        data = __import__("json").loads(source.DATA.read_text())
        data = copy.deepcopy(data)
        data["publicationApproved"] = True
        with self.assertRaisesRegex(ValueError, "cannot imply approval"):
            source.validate(data)


if __name__ == "__main__":
    unittest.main()
