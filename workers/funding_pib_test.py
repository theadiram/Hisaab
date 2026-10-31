import unittest
from html import escape
from funding_pib import parse_all_states, parse_maharashtra, STATE_NAMES

MANIFEST = {
    "sha256": "0" * 64,
    "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2294241",
    "retrievedAt": "2026-10-10T00:00:00Z",
}


def table(rows):
    return (
        "<table>"
        + "".join(
            "<tr>" + "".join("<td>" + escape(str(c)) + "</td>" for c in row) + "</tr>"
            for row in rows
        )
        + "</table>"
    )


def annexure(conflicts=(), unknown=False, bad_mirror=False):
    names = list(
        {
            code: name for name, code in STATE_NAMES.items() if not code.startswith("historical:")
        }.values()
    )
    rows = [[i + 1, name] + ["1.00"] * 9 for i, name in enumerate(names)]
    if unknown:
        rows[0][8] = "--"
    totals = ["Total"] + [
        str(28 + (1 if col in conflicts else 0) - (1 if unknown and col == 6 else 0))
        for col in range(9)
    ]
    header = [
        "State",
        "Name",
        "Allocation under SDRF including Centre and State share",
        "Central releases",
        "NDRF releases",
    ]
    original = table([header, ["Fiscal columns"]] + rows[:14]) + table(rows[14:] + [totals])
    mirror = original.replace(">1.00<", ">2.00<", 1) if bad_mirror else original
    return (original + mirror).encode()


class PIBFundingTests(unittest.TestCase):
    def test_mirror_is_not_double_counted_and_combined_allocations_stay_combined(self):
        facts, check = parse_all_states(annexure(), MANIFEST)
        self.assertEqual(len(facts), 252)
        self.assertEqual(check["columnsReconciled"], 9)
        self.assertEqual(len({r["id"] for r in facts}), 252)
        self.assertTrue(all(r["share"] == "combined" for r in facts if r["measure"] == "allocated"))
        self.assertEqual(facts[0]["amountRupees"], "10000000.00")

    def test_conflicting_totals_withhold_whole_columns(self):
        facts, check = parse_all_states(annexure(conflicts=(5, 8)), MANIFEST)
        self.assertEqual(check["conflictingColumnsOneBased"], [6, 9])
        self.assertTrue(
            all(
                r["conflict"]
                for r in facts
                if r["financialYear"] == "2025-2026" and r["measure"] == "released"
            )
        )

    def test_dash_stays_unknown(self):
        facts, check = parse_all_states(annexure(unknown=True), MANIFEST)
        self.assertEqual(check["columnsReconciled"], 9)
        self.assertTrue(any(r["amountRupees"] is None for r in facts))

    def test_mirrored_edition_disagreement_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_all_states(annexure(bad_mirror=True), MANIFEST)

    def test_older_releases_are_not_published_twice_or_fire_funding_called_relief(self):
        header = [
            "Financial Year",
            "Allocation under SDRF",
            "Release of Central Share under SDRF",
            "Release under NDRF",
        ]
        rows = [
            [f"{y}-{str(y + 1)[2:]}", "1.00", "0.50", "1.00", "2.00*"] for y in range(2021, 2026)
        ]
        raw = table([header, ["Central and state shares"]] + rows) * 2
        facts = parse_maharashtra(raw.encode(), MANIFEST)
        self.assertEqual(len(facts), 12)
        self.assertEqual(facts[0]["amountRupees"], "42885000000.00")
        self.assertTrue(
            all(
                r["conflict"]
                for r in facts
                if r["measure"] == "released" and r["financialYear"] >= "2023-2024"
            )
        )
        self.assertFalse(
            any(r["programmeId"] == "NDRF" and r["financialYear"] >= "2024-2025" for r in facts)
        )


if __name__ == "__main__":
    unittest.main()
