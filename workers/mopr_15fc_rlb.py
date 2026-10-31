"""Validate MoPR's state-wise XV Finance Commission RLB allocation/release table.

This is a source-level grant ledger, not state development expenditure or
project payments. Original and release amounts are preserved separately.
"""

import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/acquisition/national-panchayat-finance/15th-fc-rlb-allocation-release.json"
ORIGINAL = (
    ROOT
    / "data/originals/national-panchayat-finance/15th-fc-allocation-release-as-of-2026-03-31.pdf"
)
EXPECTED_SHA256 = "912acccbf36f106d8943d42185bd31a316540a041d73aa4cc9d9202b7e4f15ad"
YEARS = ["2020-21", "2021-22", "2022-23", "2023-24", "2024-25", "2025-26"]


def validate(data=None):
    data = data or json.loads(DATA.read_text())
    digest = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256 or digest != data["source"]["sha256"]:
        raise ValueError("MoPR source checksum mismatch")
    if data["unit"] != "crore_rupees" or data["source"]["asOf"] != "2026-03-31":
        raise ValueError("Unexpected amount unit or cutoff")
    if len(data["states"]) != 28 or len({r["state"] for r in data["states"]}) != 28:
        raise ValueError("Expected exactly 28 unique states")
    if data["measureScope"] != "XV Finance Commission grants to Rural Local Bodies":
        raise ValueError("Unexpected scope")
    if data["publicationApproved"] or data["sourceRightsApproved"]:
        raise ValueError("Private source transcription cannot imply approval")

    aggregate = {year: {"allocation": Decimal(0), "release": Decimal(0)} for year in YEARS}
    differences = []
    for row in data["states"]:
        if set(row["years"]) != set(YEARS):
            raise ValueError(f"Missing year for {row['state']}")
        for year, values in row["years"].items():
            for measure in ("allocation", "release"):
                amount = Decimal(values[measure])
                if amount < 0:
                    raise ValueError(f"Negative amount for {row['state']} {year}")
                aggregate[year][measure] += amount
        for measure in ("allocation", "release"):
            annual_sum = sum((Decimal(v[measure]) for v in row["years"].values()), Decimal(0))
            delta = annual_sum - Decimal(row["total"][measure])
            if abs(delta) > Decimal("0.02"):
                raise ValueError(f"State total mismatch: {row['state']} {measure}")
            if delta:
                differences.append(
                    {
                        "control": "state_years_vs_printed_total",
                        "state": row["state"],
                        "measure": measure,
                        "differenceCrore": str(delta),
                    }
                )
    for year in YEARS:
        for measure in ("allocation", "release"):
            delta = aggregate[year][measure] - Decimal(data["printedTotals"][year][measure])
            if abs(delta) > Decimal("0.02"):
                raise ValueError(f"Printed annual total mismatch: {year} {measure}")
            if delta:
                differences.append(
                    {
                        "control": "state_rows_vs_printed_annual_total",
                        "year": year,
                        "measure": measure,
                        "differenceCrore": str(delta),
                    }
                )
    for measure in ("allocation", "release"):
        delta = sum((Decimal(r["total"][measure]) for r in data["states"]), Decimal(0)) - Decimal(
            data["printedGrandTotal"][measure]
        )
        if delta:
            raise ValueError(f"Printed grand-total mismatch: {measure}")
    return {
        "states": len(data["states"]),
        "years": len(YEARS),
        "sourceHashVerified": True,
        "fy2025_26": {
            "allocationCrore": data["printedTotals"]["2025-26"]["allocation"],
            "releaseCrore": data["printedTotals"]["2025-26"]["release"],
        },
        "cumulative": data["printedGrandTotal"],
        "unresolvedPrintedControlDifferences": differences,
        "projectPayments": 0,
        "settlementVerified": False,
        "publicationApproved": False,
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
