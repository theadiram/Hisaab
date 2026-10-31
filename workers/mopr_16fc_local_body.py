"""Validate state-wise XVI Finance Commission RLB/ULB grant recommendations."""

import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = (
    ROOT / "data/acquisition/national-panchayat-finance/16fc-state-local-body-recommendations.json"
)
ORIGINAL = ROOT / "data/originals/national-panchayat-finance/16th-finance-commission-volume-2.pdf"
EXPECTED_SHA256 = "ed5570ef28276627eeb7c9f4366d865d5594a7121a46cdc7534e222dbd529e23"
COMPONENTS_ORIGINAL = (
    ROOT / "data/originals/national-panchayat-finance/pib-16fc-rlb-components-2026-07-28.html"
)
COMPONENTS_SHA256 = "fd9edd8f73eaea7ac146f74c543a7a15ffa1eefe7909035bc41e1f9b1531424d"
YEARS = ["2026-27", "2027-28", "2028-29", "2029-30", "2030-31"]
MEASURES = ["ruralLocalBodiesRecommended", "urbanLocalBodiesRecommended"]


def validate(data=None):
    data = data or json.loads(DATA.read_text())
    digest = hashlib.sha256(ORIGINAL.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256 or digest != data["source"]["sha256"]:
        raise ValueError("16th Finance Commission report checksum mismatch")
    components_digest = hashlib.sha256(COMPONENTS_ORIGINAL.read_bytes()).hexdigest()
    if (
        components_digest != COMPONENTS_SHA256
        or components_digest != data["componentSource"]["sha256"]
    ):
        raise ValueError("MoPR grant-component source checksum mismatch")
    if len(data["states"]) != 28 or len({row["state"] for row in data["states"]}) != 28:
        raise ValueError("Expected 28 unique states")
    if data["awardPeriod"] != "2026-27 through 2030-31":
        raise ValueError("Unexpected award period")
    if data["publicationApproved"] or data["sourceRightsApproved"] or data["settlementVerified"]:
        raise ValueError("Recommendations cannot imply publication or settlement approval")

    for row in data["states"]:
        if set(row["years"]) != set(YEARS):
            raise ValueError(f"Missing award year for {row['state']}")
        for measure in MEASURES:
            total = sum((Decimal(row["years"][year][measure]) for year in YEARS), Decimal(0))
            if total != Decimal(row["awardPeriodTotal"][measure]):
                raise ValueError(f"State total does not reconcile: {row['state']} {measure}")
        component_total = sum(
            (
                Decimal(row["rlbAwardPeriodComponents"][component])
                for component in ("tied", "untied", "performance")
            ),
            Decimal(0),
        )
        if component_total != Decimal(row["awardPeriodTotal"]["ruralLocalBodiesRecommended"]):
            raise ValueError(f"RLB component total does not reconcile: {row['state']}")

    for year in YEARS:
        for measure in MEASURES:
            total = sum(
                (Decimal(row["years"][year][measure]) for row in data["states"]), Decimal(0)
            )
            if total != Decimal(data["annualPrintedTotals"][year][measure]):
                raise ValueError(f"Annual total does not reconcile: {year} {measure}")
    for measure in MEASURES:
        total = sum(
            (Decimal(row["awardPeriodTotal"][measure]) for row in data["states"]), Decimal(0)
        )
        if total != Decimal(data["printedAwardPeriodTotals"][measure]):
            raise ValueError(f"Award-period total does not reconcile: {measure}")
    for component in ("tied", "untied", "performance"):
        total = sum(
            (Decimal(row["rlbAwardPeriodComponents"][component]) for row in data["states"]),
            Decimal(0),
        )
        if total != Decimal(data["componentPrintedTotals"][component]):
            raise ValueError(f"RLB component grand total does not reconcile: {component}")
    return {
        "states": 28,
        "years": 5,
        "sourceHashVerified": True,
        "componentSourceHashVerified": True,
        "fy2026_27RecommendedCrore": {
            "rlb": data["annualPrintedTotals"]["2026-27"]["ruralLocalBodiesRecommended"],
            "ulb": data["annualPrintedTotals"]["2026-27"]["urbanLocalBodiesRecommended"],
        },
        "awardPeriodRecommendedCrore": data["printedAwardPeriodTotals"],
        "projectPayments": 0,
        "publicationApproved": False,
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
