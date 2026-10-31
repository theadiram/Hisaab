import unittest
from funding_programmes import (
    amount,
    state,
    reconcile,
    mirrored,
    emrs,
    employment,
    nhm_history,
    STATE_NAMES,
)
from funding_pib_test import table, MANIFEST


def states():
    return list(
        {
            code: name for name, code in STATE_NAMES.items() if not code.startswith("historical:")
        }.values()
    ) + ["Jammu & Kashmir"]


class ProgrammeFundingTests(unittest.TestCase):
    def test_exact_lakh_and_crore_and_unknown_are_separate(self):
        self.assertEqual(amount("10,638.59", "lakh"), "1063859000.00")
        self.assertEqual(amount("1,929.70", "crore"), "19297000000.00")
        self.assertEqual(amount("0.00", "crore"), "0.00")
        self.assertIsNone(amount("", "crore"))
        self.assertIsNone(amount("-", "crore"))
        self.assertEqual(amount("0.000000001", "crore"), "0.01")
        with self.assertRaises(ValueError):
            amount("0.0000000001", "crore")

    def test_printed_precision_bound_does_not_hide_material_conflicts(self):
        small = reconcile([["1.00"], ["1.00"]], [0], ["1.99"], allow_rounding=True)
        self.assertEqual(small[0]["status"], "within_printed_precision")
        large = reconcile([["1.00"], ["1.00"]], [0], ["1.90"], allow_rounding=True)
        self.assertEqual(large[0]["status"], "conflict")
        self.assertEqual(reconcile([["1.00"], ["1.00"]], [0], ["1.99"])[0]["status"], "conflict")

    def test_mirror_disagreement_is_rejected(self):
        with self.assertRaises(ValueError):
            mirrored([[["1"]], [["2"]]], lambda t: True)

    def test_historical_identity_is_not_invented_on_modern_polygons(self):
        self.assertEqual(state("Jammu & Kashmir", 2019)[0], "historical:jammu_kashmir_combined")
        self.assertEqual(state("Jammu & Kashmir", 2020)[0], "1")
        self.assertEqual(state("Dadra & Nagar Haveli", 2024)[0], "historical:dadra_nagar_haveli")
        with self.assertRaises(ValueError):
            state("Nearby Assam school", 2024)

    def test_emrs_mirror_is_deduplicated_and_provisional_scope_retained(self):
        header = [
            "S. No.",
            "Name of the State/UT",
            "2020-21",
            "2021-22",
            "2022-23",
            "2023-24",
            "2024-25*",
        ]
        names = [n for n in states() if n not in ("Goa", "Haryana", "Punjab")] + [
            "Ladakh",
            "Dadra & Nagar Haveli",
        ]
        rows = [[str(i), name] + ["100.00"] * 5 for i, name in enumerate(names, 1)]
        raw = (table([header] + rows + [["", "Total"] + ["2800.00"] * 5]) * 2).encode()
        facts, checks = emrs(raw, MANIFEST)
        self.assertEqual(len(facts), 140)
        self.assertEqual(len({r["id"] for r in facts}), 140)
        self.assertTrue(all(c["status"] == "exact" for c in checks))
        self.assertTrue(all(r["amountRupees"] == "10000000.00" for r in facts))
        self.assertTrue(all(r["classification"] == "awaiting_review" for r in facts))
        self.assertIn("provisional", facts[4]["notes"])
        broken = raw.replace(b">2800.00<", b">2801.00<")
        bad, _ = emrs(broken, MANIFEST)
        self.assertTrue(all(r["conflict"] for r in bad if r["financialYear"] == "2020-2021"))

    def test_mother_sanctions_are_not_imported_as_releases(self):
        names = states() + [
            "Andaman & Nicobar",
            "Dadra & Nagar Haveli Daman & Diu",
            "Lakshadweep",
            "Puducherry",
            "Ladakh",
        ]
        rows = [[str(i), name] + ["1.00"] * 5 for i, name in enumerate(names, 1)]
        heading = [
            "State/Union Territory (UT)-wise details of funds released under Mahatma Gandhi NREGS in last five financial years w.e.f. FY 2021-22 to FY 2025-26."
        ]
        raw = (
            table([["Mother Sanctions Issued as 1st Installment"], ["Assam", "100"]])
            + table(
                [
                    heading,
                    ["SI. No.", "States/UTs", "Funds released (Rs. in crores)"],
                    ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"],
                ]
                + rows
                + [["Total", ""] + ["34.00"] * 5]
            )
            * 2
        ).encode()
        facts, _ = employment(raw, MANIFEST)
        self.assertEqual(len(facts), 170)
        self.assertFalse(any(r["financialYear"] == "2026-2027" for r in facts))
        wb = [r for r in facts if r["jurisdiction"] == "19" and r["financialYear"] == "2021-2022"][
            0
        ]
        self.assertTrue(wb["conflict"])

    def test_nhm_adjacent_expenditure_and_pre_creation_zeros_do_not_become_release(self):
        names = states() + [
            "Andaman & Nicobar Islands",
            "Dadra & Nagar Haveli",
            "Daman & Diu",
            "Chandigarh",
            "Delhi",
            "Lakshadweep",
            "Puducherry",
            "Ladakh",
        ]
        rows = [[str(i), name] + ["1.00", "999.00"] * 5 + [""] for i, name in enumerate(names, 1)]
        source = [
            [""] * 13,
            [
                "Statement Showing State/UT-wise Central Releases and Expenditure under National Health Mission (NHM) for the FY 2016-17 to 2020-21"
            ],
            ["Rs. in crore"],
            [
                "S. No.",
                "Name of the State/UT",
                "2016-17",
                "2017-18",
                "2018-19",
                "2019-20",
                "2020-21",
                "",
            ],
            ["Central Release", "Expenditure"] * 5,
        ] + rows
        facts, _ = nhm_history((table(source) * 2).encode(), MANIFEST)
        self.assertEqual(len(facts), 185)
        self.assertTrue(all(r["amountRupees"] == "10000000.00" for r in facts))
        self.assertTrue(all(r["conflict"] for r in facts if r["financialYear"] == "2020-2021"))
        self.assertTrue(
            all(
                r["aggregation"] == "context"
                for r in facts
                if r["jurisdiction"] == "37" and r["financialYear"] < "2020-2021"
            )
        )


if __name__ == "__main__":
    unittest.main()
