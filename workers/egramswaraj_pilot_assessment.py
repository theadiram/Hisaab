"""Compare preserved pilot sources without approving payment joins."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    base = ROOT / "data/acquisition/egramswaraj"
    reports = {
        str(year): json.loads((base / f"api/21-{year}-115783/assessment.json").read_text())
        for year in [2024, 2025, 2026]
    }
    rows = json.loads((base / "chandanbhati-2025-report-rows.json").read_text())
    api_ids = {p["activityId"] for p in reports["2025"]["projects"]}
    missing = [r for r in rows[1:] if r[1] not in api_ids]
    candidates = []
    for year, code, cr, basis in [
        (
            "2025",
            "122313690",
            "04-2025-26",
            "Approval number 04, plan year and detailed drain description corroborate CR reference; owner review and original bill allocation still required.",
        ),
        (
            "2024",
            "100979008",
            "20-2024-25",
            "Office maintenance description and year suggest candidate; CR 20 not present in API approval identifier. Identity remains unconfirmed.",
        ),
    ]:
        project = next(p for p in reports[year]["projects"] if p["activityId"] == code)
        candidates.append(
            dict(
                localWorkReference=cr,
                activityId=code,
                planYear=year,
                basis=basis,
                sourceProject=project,
                linkStatus="proposed",
                approved=False,
            )
        )
    dossier = dict(
        localBodyCode="115783",
        identityBasis="Official report Gram Panchayat selector value; Odisha/Balangir/Balangir/Chandanbhati",
        partitions={
            year: {
                k: d[k]
                for k in [
                    "counts",
                    "uniqueActivityIds",
                    "activitiesWithReportedGeotags",
                    "failures",
                ]
            }
            for year, d in reports.items()
        },
        reportComparison=dict(
            year="2025",
            reportRows=len(rows) - 1,
            apiRows=len(api_ids),
            reportOnlyRows=missing,
            explanation="All eleven report-only rows are Activity Created; consistent with approved-activity service scope. Confirm scope with custodian.",
        ),
        candidates=candidates,
        verifiedPaymentLinks=0,
        approvedLocations=0,
    )
    (base / "pilot-api-assessment.json").write_text(json.dumps(dossier, indent=2) + "\n")
    summary = dict(
        updatedOn="2026-10-07",
        panchayat="Chandanbhati",
        localBodyCode="115783",
        planYears=["2024-2025", "2025-2026", "2026-2027"],
        planningRecords=sum(d["counts"]["planning"] for d in reports.values()),
        activitiesWithReportedGeotags=sum(
            d["activitiesWithReportedGeotags"] for d in reports.values()
        ),
        technicalRecords=sum(d["counts"]["technical"] for d in reports.values()),
        administrativeRecords=sum(d["counts"]["administrative"] for d in reports.values()),
        activityReportRows=111,
        reportOnlyCreatedActivities=len(missing),
        proposedPaymentMatches=2,
        verifiedPaymentLinks=0,
        approvedLocations=0,
        permission="Pending",
        scope="One panchayat; returned activity-year records, not nationwide projects or payments.",
    )
    (ROOT / "data/panchayat-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
