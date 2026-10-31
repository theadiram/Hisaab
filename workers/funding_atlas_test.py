import unittest
from decimal import InvalidOperation
from funding_atlas import exact_rupees, Links


class FundingAcquisitionTests(unittest.TestCase):
    def test_exact_source_precision_and_unknown_notations(self):
        self.assertEqual(exact_rupees("76.704"), "767040000.00")
        self.assertEqual(exact_rupees("1,971.00"), "19710000000.00")
        self.assertEqual(exact_rupees("-0.000000001"), "-.01".replace("-.", "-0."))
        self.assertIsNone(exact_rupees("--"))
        self.assertIsNone(exact_rupees("..."))
        self.assertEqual(exact_rupees("181.60#"), "1816000000.00")

    def test_sub_paise_rejected(self):
        with self.assertRaises(ValueError):
            exact_rupees("0.0000000001")

    def test_observed_archive_links_are_preserved(self):
        p = Links()
        p.feed(
            '<a href="/budget2025-26/index.php">2025-2026</a><a href="doc/16fcvol2.pdf">Volume II</a>'
        )
        self.assertEqual(p.links[0], ("2025-2026", "/budget2025-26/index.php"))
        self.assertNotEqual(p.links[1][1].rsplit("/", 1)[-1], "vol2.pdf")


if __name__ == "__main__":
    unittest.main()
