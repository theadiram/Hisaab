import unittest
from unittest.mock import patch
import delhi_coverage


class CoverageTests(unittest.TestCase):
    def fixture(self):
        return dict(
            updatedOn="2026-10-09",
            period=dict(
                closedFinancialYear="2025–26",
                currentFinancialYear="2026–27",
                cutoff="2026-10-09",
                privateCorrespondence="PRIVATE_SENTINEL",
            ),
            authorities=[
                dict(
                    id="pwd",
                    name="PWD",
                    level="GNCTD",
                    rosterStatus="partial",
                    expectedUnits=None,
                    nextAction="Obtain roster",
                    sourceUrl="https://www.pwddelhi.gov.in/",
                    units=[
                        dict(
                            id="pwd-ser2",
                            name="SER-2",
                            workRegister="missing",
                            paymentRegister="missing",
                            reconciliation="pending",
                            geography="missing",
                            publication="pending",
                            nextAction="Obtain registers",
                            bankAccount="PRIVATE_SENTINEL",
                        )
                    ],
                )
            ],
        )

    def run_fixture(self, source):
        with (
            patch.object(delhi_coverage.json, "loads", return_value=source),
            patch.object(delhi_coverage.Path, "read_text", return_value="{}"),
        ):
            return delhi_coverage.current()

    def test_minimized_projection_and_unknown_denominator(self):
        result = self.run_fixture(self.fixture())
        self.assertIsNone(result["authorities"][0]["expectedUnits"])
        self.assertEqual(result["completeUnits"], 0)
        self.assertEqual(result["completePaymentCards"], 0)
        self.assertNotIn("PRIVATE_SENTINEL", str(result))

    def test_rejects_duplicate_and_unsupported_review(self):
        source = self.fixture()
        source["authorities"][0]["units"][0]["publication"] = "reviewed"
        with self.assertRaises(ValueError):
            self.run_fixture(source)
        source = self.fixture()
        source["authorities"][0]["units"].append(source["authorities"][0]["units"][0].copy())
        with self.assertRaises(ValueError):
            self.run_fixture(source)

    def test_verified_roster_requires_denominator(self):
        source = self.fixture()
        source["authorities"][0]["rosterStatus"] = "verified"
        with self.assertRaises(ValueError):
            self.run_fixture(source)


if __name__ == "__main__":
    unittest.main()
