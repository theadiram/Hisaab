"""Preserve and reconcile a declared public road-level financial CSV export.
Reported expenditure is a cumulative snapshot, never an individual payment.
"""

import argparse, csv, hashlib, io, json
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = "ommas-road-financial-csv-v1"
REPORT_URL = "https://pmgsy.dord.gov.in/MvcReportViewer.aspx?_r=%2fPMGSYCitizen%2fFinalBillPaymentPending&PINTStateCode=26&PINTAgencyCode=22&PINTFACode=0&PINTPMGSYVersion=0&LocalizationValue=en&DispAgencyName=Rural+Works+Organisation"


def extract(raw):
    rows = list(csv.reader(io.StringIO(raw.decode("utf-8-sig"))))
    headers = next(
        (r for r in rows if "PACKAGE_ID1" in r and "ROAD_NAME1" in r and "EXPENDITURE" in r), None
    )
    if not headers:
        raise ValueError("Expected road-level report schema absent")
    data = [
        dict(zip(headers, r)) for r in rows[rows.index(headers) + 1 :] if len(r) == len(headers)
    ]
    if not data or any(
        "Rs. In Lacs" not in r["Textbox12"] or "Rs. In Lacs" not in r["Textbox13"] for r in data
    ):
        raise ValueError("Explicit amount units absent or changed")
    parsed = []
    seen = set()
    for i, r in enumerate(data, 1):
        identity = (r["PACKAGE_ID1"], r["ROAD_NAME1"].strip().casefold())
        if identity in seen:
            raise ValueError("Duplicate road identity in export")
        seen.add(identity)
        amounts = {
            name: Decimal(r[key].replace(",", "")) * Decimal(100000)
            for name, key in [("sanction", "SANCTION_COST"), ("reportedExpenditure", "EXPENDITURE")]
        }
        if any(
            not a.is_finite() or a < 0 or a != a.quantize(Decimal(".01")) for a in amounts.values()
        ):
            raise ValueError("Invalid amount or fractional paise")
        parsed.append(
            {
                "row": i,
                "packageId": r["PACKAGE_ID1"],
                "title": r["ROAD_NAME1"].strip(),
                "districtLabel": r["DISTRICT_NAME1"].strip(),
                "sanctionAmount": format(amounts["sanction"], ".2f"),
                "reportedExpenditureAmount": format(amounts["reportedExpenditure"], ".2f"),
                "originalUnit": "lakh",
                "originalSanction": r["SANCTION_COST"],
                "originalExpenditure": r["EXPENDITURE"],
                "reportedPhysicalCompletionDate": datetime.strptime(
                    " ".join(r["PhysicalCompletion"].split()), "%b %d %Y"
                )
                .date()
                .isoformat(),
                "raw": r,
            }
        )
    expected = {
        name: Decimal(data[-1][key].replace(",", "")) * 100000
        for name, key in [("sanction", "SANCTION_COST1"), ("reportedExpenditure", "EXPENDITURE1")]
    }
    if any(
        sum(Decimal(r[field]) for r in parsed) != expected[name]
        for name, field in [
            ("sanction", "sanctionAmount"),
            ("reportedExpenditure", "reportedExpenditureAmount"),
        ]
    ):
        raise ValueError("Export totals do not reconcile")
    return parsed


def run(file):
    raw = Path(file).read_bytes()
    rows = extract(raw)
    digest = hashlib.sha256(raw).hexdigest()
    stamp = datetime.now(timezone.utc).isoformat()
    source = "ommas-road-financial"
    original = ROOT / "data/originals" / source / digest
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(raw)
    manifests = ROOT / "data/acquisition/documents"
    manifests.mkdir(parents=True, exist_ok=True)
    manifest = {
        "sourceId": source,
        "sourceName": "OMMAS official road-level final-bill pending report",
        "sourceFamily": "National schemes",
        "sha256": digest,
        "url": REPORT_URL,
        "contextUrl": "https://pmgsy.dord.gov.in/",
        "retrievedAt": stamp,
        "original": str(original.relative_to(ROOT)),
        "contentType": "text/csv",
        "parserVersion": VERSION,
        "permissionStatus": "policy_identified_pending_mfa_review",
        "permission": "Accurate attributed OMMAS text/data reuse; record retrieval date and no endorsement",
        "policyUrl": "https://pmgsy.dord.gov.in/Home/HomeCopyrightPolicy/",
        "locator": "Odisha / Rural Works Organisation / All funding agencies / All schemes; 2020–2021 pending financial completion drilldown",
        "limitations": [
            "Parent drilldown advertises 9 pending works but export contains 10 rows; preserve discrepancy.",
            "Physical completion is reported, not a completion certificate.",
            "Expenditure is cumulative; individual voucher dates, payees and net/gross semantics absent.",
        ],
    }
    (manifests / (digest + ".json")).write_text(json.dumps(manifest, indent=2) + "\n")
    roads = json.loads((ROOT / "data/acquisition/pmgsy-national/state-26.json").read_text())
    links = {
        r["officialRoadId"]: r
        for r in map(
            json.loads,
            (ROOT / "data/acquisition/geography/road-matches.jsonl").read_text().splitlines(),
        )
    }
    counts = {
        "sourceRows": len(rows),
        "uniqueRoadMatches": 0,
        "geographyProposals": 0,
        "sanctionValuesDifferBetweenReports": 0,
        "individualPayments": 0,
        "completionCertificates": 0,
        "published": 0,
    }
    cases = []
    for row in rows:
        matches = [
            r
            for r in roads
            if r["IMS_PACKAGE_ID"] == row["packageId"]
            and r["IMS_ROAD_NAME"].strip().casefold() == row["title"].casefold()
        ]
        row.update(
            {
                "documentHash": digest,
                "sourceUrl": REPORT_URL,
                "retrievedAt": stamp,
                "sourceLocator": manifest["locator"] + "; exported row " + str(row["row"]),
                "status": "private_review_pending",
                "paymentDates": None,
                "contractor": None,
            }
        )
        if len(matches) == 1:
            road = matches[0]
            road_id = str(road["IMS_PR_ROAD_CODE"])
            counts["uniqueRoadMatches"] += 1
            link = links.get(road_id)
            counts["geographyProposals"] += int(link is not None)
            differs = Decimal(str(road["TOTAL_SANCTIONED_COST"])) != Decimal(
                row["originalSanction"].replace(",", "")
            )
            counts["sanctionValuesDifferBetweenReports"] += int(differs)
            row.update(
                {
                    "officialRoadId": road_id,
                    "existingCandidateId": link["candidateId"] if link else None,
                    "geographyProposal": link,
                    "contractSourceValueUnscaled": str(road["TEND_AGREEMENT_AMOUNT"]),
                    "contractUnitVerified": False,
                    "agreementNumber": road.get("TEND_AGREEMENT_NUMBER"),
                    "sanctionComparison": "different_source_values_requires_revision_review"
                    if differs
                    else "exact_numeric_match",
                    "nationalRoadRaw": road,
                }
            )
        else:
            row["identityIssue"] = "Ambiguous or absent package/title match"
        cases.append(row)
    folder = ROOT / "data/acquisition/ommas-financial"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "road-financial-cases.json").write_text(
        json.dumps({"manifest": manifest, "cases": cases}, indent=2) + "\n"
    )
    summary = {
        "checkedAt": stamp,
        "sourceUrl": REPORT_URL,
        "counts": counts,
        "permissionPolicy": manifest["policyUrl"],
        "meaning": "Source-reported road sanction and cumulative expenditure with reported physical completion dates. No individual payments or approved geography.",
        "limitations": manifest["limitations"],
    }
    (ROOT / "data/road-financial-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"sha256": digest, **counts}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    run(p.parse_args().csv)
