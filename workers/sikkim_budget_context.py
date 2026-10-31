"""Checksum/source-scope check for Sikkim's official 2026-27 budget notice."""

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/acquisition/state-development/sikkim-budget-context-2026-27.json"
EXPECTED_HASH = "dd586a78bde6380e9579e0c42f602411918a1f46d30c2c5758f21c7c176bbe8b"


def validate(data=None):
    data = data or json.loads(DATA.read_text())
    original = ROOT / data["source"]["original"]
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    if digest != EXPECTED_HASH or digest != data["source"]["sha256"]:
        raise ValueError("Sikkim budget notice checksum mismatch")
    if data["jurisdiction"] != "Sikkim" or data["financialYear"] != "2026-27":
        raise ValueError("Unexpected state or budget year")
    if data["publicationApproved"] or data["sourceRightsReviewed"]:
        raise ValueError("Budget context is not approved for publication")
    if data["figures"]["capitalExpenditureCrore"]["basis"] != "excluding loans and advances":
        raise ValueError("Capital figure scope must remain explicit")
    if (
        data["announcedRoadUpgrade"]["estimatedCostCrore"] != "546"
        or data["announcedRoadUpgrade"]["awarded"]
    ):
        raise ValueError("Road announcement must not be treated as a contract or payment")
    return {
        "sourceHashVerified": True,
        "budgetContextFigures": len(data["figures"]),
        "announcedProjectCandidates": 1,
        "detailedAfsFound": False,
        "payments": 0,
        "publicationApproved": False,
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
