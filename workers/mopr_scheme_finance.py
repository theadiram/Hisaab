"""Validate the visually transcribed MoPR scheme BE/RE/actuals statement.

The source is a scanned one-page Union-ministry report. Values remain private
and unapproved; this is national programme accounting, not state or project data.
"""

import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/acquisition/national-panchayat-finance/mopr-scheme-finance.json"
EXPECTED_SHA256 = "997ebf8b9c1867ed3ebb9148e5c801fca11ed023214a6e18ff95ae96184e364e"


def validate(data=None):
    data = data or json.loads(DATA.read_text())
    original = ROOT / data["source"]["original"]
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256 or digest != data["source"]["sha256"]:
        raise ValueError("MoPR original hash mismatch")
    if data["source"]["unit"] != "crore_rupees" or data["source"]["pageCount"] != 1:
        raise ValueError("Unexpected source unit or page count")
    if data["geographicScope"] != "India / ministry-wide; no state distribution shown":
        raise ValueError("Source must remain nationally scoped")
    if data["publicationApproved"] or data["sourceRightsApproved"]:
        raise ValueError("Visual transcription does not approve publication or reuse")

    for period in data["periods"]:
        # Scheme components, excluding Secretariat non-scheme, reconcile to the
        # printed scheme total. 2025-26 RE has one printed cell merged across
        # RGSA/Nirbhaya; the grouped value must remain grouped and counted once.
        components = period["schemeComponents"]
        visible = sum(
            (
                Decimal(row["amountCrore"])
                for row in components
                if row.get("amountCrore") is not None
            ),
            Decimal(0),
        )
        merged = sum(
            (Decimal(row["amountCrore"]) for row in period.get("mergedSourceCells", [])), Decimal(0)
        )
        if visible + merged != Decimal(period["printedSchemeTotalCrore"]):
            raise ValueError(
                f"Scheme control mismatch for {period['financialYear']} {period['measure']}"
            )
        grand = Decimal(period["printedSchemeTotalCrore"]) + Decimal(
            period["secretariatNonSchemeCrore"]
        )
        if grand != Decimal(period["printedGrandTotalCrore"]):
            raise ValueError(
                f"Grand-total control mismatch for {period['financialYear']} {period['measure']}"
            )
    return {
        "periods": len(data["periods"]),
        "sourceHashVerified": True,
        "stateAllocatedAmounts": 0,
        "projectPayments": 0,
        "publicationApproved": False,
    }


if __name__ == "__main__":
    print(json.dumps(validate()))
