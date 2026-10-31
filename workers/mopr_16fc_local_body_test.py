import copy
import json
import unittest

import mopr_16fc_local_body as source


@unittest.skipUnless(
    source.DATA.exists(),
    "Private source-acquisition fixtures are not included in the public checkout",
)
class Mopr16FCLocalBodyTest(unittest.TestCase):
    def test_source_and_controls(self):
        result = source.validate()
        self.assertEqual(result["states"], 28)
        self.assertEqual(result["fy2026_27RecommendedCrore"], {"rlb": "55909", "ulb": "37272"})
        self.assertEqual(
            result["awardPeriodRecommendedCrore"],
            {"ruralLocalBodiesRecommended": "435236", "urbanLocalBodiesRecommended": "290157"},
        )
        self.assertFalse(result["publicationApproved"])

    def test_rejects_changed_state_total(self):
        data = copy.deepcopy(json.loads(source.DATA.read_text()))
        data["states"][0]["awardPeriodTotal"]["ruralLocalBodiesRecommended"] = "1"
        with self.assertRaisesRegex(ValueError, "State total does not reconcile"):
            source.validate(data)

    def test_rejects_treating_recommendation_as_public_approval(self):
        data = copy.deepcopy(json.loads(source.DATA.read_text()))
        data["publicationApproved"] = True
        with self.assertRaisesRegex(ValueError, "cannot imply publication"):
            source.validate(data)


if __name__ == "__main__":
    unittest.main()
