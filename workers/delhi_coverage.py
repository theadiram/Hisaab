"""Project only the tracked Delhi acquisition scope; no money or approvals."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def current():
    source = json.loads((ROOT / "data/delhi-authority-scope.json").read_text())
    authorities = []
    authority_ids = set()
    unit_ids = set()
    for a in source["authorities"]:
        if a["id"] in authority_ids:
            raise ValueError("Duplicate Delhi authority")
        authority_ids.add(a["id"])
        units = []
        for u in a["units"]:
            if u["id"] in unit_ids or u["publication"] != "pending":
                raise ValueError("Duplicate unit or unsupported publication decision")
            unit_ids.add(u["id"])
            units.append(
                {
                    k: u[k]
                    for k in (
                        "id",
                        "name",
                        "workRegister",
                        "paymentRegister",
                        "reconciliation",
                        "geography",
                        "publication",
                        "nextAction",
                    )
                }
            )
        expected = a["expectedUnits"]
        if expected is not None and (type(expected) != int or expected < len(units)):
            raise ValueError("Invalid Delhi roster denominator")
        if a["rosterStatus"] == "verified" and (expected is None or expected != len(units)):
            raise ValueError("Verified roster is incomplete")
        projected = {
            k: a[k]
            for k in (
                "id",
                "name",
                "level",
                "rosterStatus",
                "expectedUnits",
                "nextAction",
                "sourceUrl",
            )
        }
        projected["units"] = units
        authorities.append(projected)
    period = {
        k: source["period"][k] for k in ("closedFinancialYear", "currentFinancialYear", "cutoff")
    }
    return dict(
        updatedOn=source["updatedOn"],
        status="incomplete",
        period=period,
        authorityInventoryComplete=False,
        knownAuthorities=len(authorities),
        knownUnits=len(unit_ids),
        completeUnits=0,
        completePaymentCards=0,
        authorities=authorities,
    )


if __name__ == "__main__":
    result = current()
    (ROOT / "data/delhi-coverage.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    )
