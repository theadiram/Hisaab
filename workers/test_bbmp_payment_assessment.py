import unittest
from bbmp_payment_assessment import assess, amount, reference


def row(rtgs="000434 / 09-Apr-2025", gross="727261", net="700640"):
    return dict(
        slno="1",
        id="708051",
        ward="12",
        wodetails="012-20-000078</a>Water tanker",
        contractor="Person 9999999999",
        brnumber="BR - 000076 / 06-Feb-2025 Rtgs - " + rtgs,
        amount=gross,
        nett=net,
        deduction="26621",
    )


class BillAssessmentTests(unittest.TestCase):
    def test_two_rtgs_do_not_double_bill_or_invent_payment_amount(self):
        result = assess([row(), row("000535 / 05-Jul-2025")])
        self.assertEqual(len(result["bills"]), 1)
        self.assertEqual(len(result["paymentEventReferences"]), 2)
        self.assertTrue(
            all(
                e["transactionAmount"] is None and not e["approved"]
                for e in result["paymentEventReferences"]
            )
        )
        self.assertNotIn("9999999999", str(result))

    def test_conflicting_editions_survive_and_require_review(self):
        result = assess([row(), row(gross="727262", net="700641")])
        self.assertTrue(result["bills"][0]["conflict"])
        self.assertEqual(len(result["bills"][0]["editions"]), 2)

    def test_exact_duplicate_is_not_second_event(self):
        result = assess([row(), dict(row(), slno="2")])
        self.assertEqual(len(result["paymentEventReferences"]), 1)
        self.assertEqual(result["summary"]["exactDuplicateRows"], 1)

    def test_decimal_and_bill_date_are_distinct_from_rtgs_date(self):
        self.assertEqual(amount("1,234.50"), "1234.50")
        self.assertIsNone(amount("NaN"))
        self.assertIsNone(amount("-1"))
        record = row()
        self.assertEqual(reference(record["brnumber"], "BR")["date"], "2025-02-06")
        self.assertEqual(reference(record["brnumber"], "Rtgs")["date"], "2025-04-09")

    def test_unrecognized_job_does_not_create_geography(self):
        result = assess([dict(row(), wodetails="unknown name")])
        self.assertIsNone(result["bills"][0]["jobCode"])
        self.assertEqual(result["summary"]["unrecognizedJobRows"], 1)


if __name__ == "__main__":
    unittest.main()
