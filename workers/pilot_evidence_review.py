"""Build reproducible pilot checks without approving geography or settlement."""

import json, math
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def distance(a, b):
    lat1, lat2 = map(math.radians, [float(a["latitude"]), float(b["latitude"])])
    dl = math.radians(float(a["longitude"]) - float(b["longitude"]))
    dp = lat1 - lat2
    return (
        6371000
        * 2
        * math.asin(
            min(
                1,
                math.sqrt(
                    math.sin(dp / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dl / 2) ** 2
                ),
            )
        )
    )


def main():
    base = ROOT / "data/acquisition/ppms/projects"
    geo = json.loads((base / "five-panchayat-geotag-assessment.json").read_text())["candidates"]
    payments = json.loads(
        (
            ROOT / "data/acquisition/ppms/payment-details/five-project-payment-assessment.json"
        ).read_text()
    )["records"]
    rows = []
    for c in geo:
        code = c["project"]["projectCode"]
        tags = c["geotags"]
        p = c["project"]["project"]
        records = [r for r in payments if r["projectCode"] == code]
        issues = []
        for r in records:
            if not r["chequeMatchesReportAmount"]:
                issues.append("Cheque amount differs from report bill amount")
            if r["beneficiaryBreakdown"]["layoutClipped"]:
                issues.append("Beneficiary amount column clipped in official PDF")
            elif not r["beneficiariesMatchCheque"]:
                issues.append(
                    "Beneficiary sum differs from cheque by "
                    + str(Decimal(r["cheque"]["chequeAmount"]) - Decimal(r["beneficiarySum"]))
                    + " source units"
                )
        issues.extend(
            [
                "Settlement date and contractor identity unverified",
                "Amount units, deductions and net/gross definitions pending",
                "Contract/work-order amount evidence missing",
                "Completion certificate missing",
                "Location accuracy and reuse terms pending",
            ]
        )
        rows.append(
            dict(
                projectCode=code,
                panchayat=p["Gram Panchayat / Ulb"],
                village=p["Village / Ward"],
                geotags=len(tags),
                stages=sorted({t["stage"] or "unknown" for t in tags}),
                maximumSpreadMetres=round(
                    max([distance(a, b) for a in tags for b in tags] or [0]), 1
                ),
                sourceIdentity="Exact page project code matched",
                locationVerified=False,
                issues=issues,
                arithmeticReconciles=bool(records)
                and all(
                    r["chequeMatchesReportAmount"] and r["beneficiariesMatchCheque"]
                    for r in records
                ),
                approved=False,
            )
        )
    # Existing Chandanbhati cashbook/API context breaks ties among candidates
    # whose source cheque and beneficiary arithmetic agree. This is a working
    # pilot choice, not financial/geographic publication approval.
    eligible = [r for r in rows if r["arithmeticReconciles"]]
    selected = next(
        (r for r in eligible if r["panchayat"] == "Chandanbhati (GP)"),
        eligible[0] if eligible else None,
    )
    (base / "five-project-geography-review.json").write_text(
        json.dumps(dict(records=rows, approved=False), indent=2) + "\n"
    )
    (ROOT / "data/panchayat-pilot-review.json").write_text(
        json.dumps(
            dict(
                candidatesAssessed=len(rows),
                workingPilot=selected["panchayat"] if selected else None,
                reason="Exact PPMS identity plus matching source bill, cheque and beneficiary arithmetic; existing eGramSwaraj work sample. Cross-system project joins remain unverified."
                if selected
                else "No candidate passes source arithmetic checks",
                reportedLocations=sum(r["geotags"] for r in rows),
                arithmeticReconciles=sum(r["arithmeticReconciles"] for r in rows),
                clippedDocuments=sum(r["beneficiaryBreakdown"]["layoutClipped"] for r in payments),
                beneficiarySumConflicts=sum(
                    not r["beneficiariesMatchCheque"]
                    and not r["beneficiaryBreakdown"]["layoutClipped"]
                    for r in payments
                ),
                approvedPayments=0,
                publishedProjects=0,
            ),
            indent=2,
        )
        + "\n"
    )
    print(
        json.dumps(
            dict(
                workingPilot=selected["panchayat"] if selected else None,
                candidates=len(rows),
                arithmeticReconciles=sum(r["arithmeticReconciles"] for r in rows),
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
