import unittest
from mplads_supporting_review import matches, compare_bill


class SupportingReviewTests(unittest.TestCase):
    def row(self, **updates):
        return dict(
            dict(
                WORK_RECOMMENDATION_DTL_ID=12,
                MP_NAME="MP A",
                STATE_NAME="Odisha",
                CONSTITUENCY="A",
                HOUSE_OF_PARLIAMENT=2,
            ),
            **updates,
        )

    def test_identifier_alone_does_not_join_other_mp_or_house(self):
        self.assertFalse(matches(self.row(), self.row(MP_NAME="MP B")))
        self.assertFalse(matches(self.row(), self.row(HOUSE_OF_PARLIAMENT=1)))
        self.assertFalse(matches(self.row(), self.row(CONSTITUENCY="B")))
        self.assertFalse(matches(self.row(), self.row(WORK_RECOMMENDATION_DTL_ID=None)))

    def test_full_and_internal_work_id_are_not_compared_as_one_namespace(self):
        self.assertTrue(matches(self.row(WORK_ID=123), self.row(WORK_ID="WS/MP1/2025-2026/12")))

    def test_gross_matching_does_not_approve_net_payment(self):
        r = compare_bill(
            {
                "grossCappedRupees": "800000",
                "deductionRupees": "38900",
                "netPayableRupees": "761100",
            },
            [{"FUND_DISBURSED_AMT": "800000"}],
        )
        self.assertTrue(r["billArithmeticMatches"])
        self.assertTrue(r["sourceRowsSumEqualsGrossBill"])
        self.assertFalse(r["sourceRowsSumEqualsNetPayable"])
        self.assertFalse(r["bankSettlementVerified"])
        self.assertFalse(r["sumIsVerifiedPaymentTotal"])


if __name__ == "__main__":
    unittest.main()
