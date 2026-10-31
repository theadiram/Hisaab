import unittest
from national_evidence_coverage import build


class CoverageTest(unittest.TestCase):
    def summary(self, *states):
        return dict(states=list(states))

    def test_missing_partition_is_unknown_not_zero(self):
        result = build(
            self.summary(dict(name="Odisha", status="assessed", rows=12)), self.summary()
        )
        self.assertIsNone(result["states"][0]["rajyaSabha"]["rows"])
        self.assertEqual(result["statesAssessed"], 0)
        self.assertEqual(result["sourceRows"], 12)

    def test_failed_partial_rows_do_not_establish_assessment(self):
        result = build(
            self.summary(dict(name="Odisha", status="failed", rows=9)),
            self.summary(dict(name="Odisha", status="assessed", rows=0)),
        )
        self.assertIsNone(result["states"][0]["lokSabha"]["rows"])
        self.assertEqual(result["states"][0]["rajyaSabha"]["rows"], 0)
        self.assertEqual(result["sourceRows"], 0)
        self.assertEqual(result["statesAssessed"], 0)

    def test_duplicate_partition_rejected(self):
        state = dict(name="Odisha", status="assessed", rows=2)
        with self.assertRaises(ValueError):
            build(self.summary(state, state), self.summary())


if __name__ == "__main__":
    unittest.main()
