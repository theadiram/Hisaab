"""Build private source-evidenced project review packets, never approvals.

Run with --refresh to check only the observed official URLs for five shortlisted
projects. No banking fields, inferred settlement dates or centroid sites leave
the original-source layer.
"""

import argparse
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from ppms_geotags import parse_geotags
from ppms_ifms import parse

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/ppms"
OUT = ROOT / "data/acquisition/first-dots"


def read(path):
    return json.loads(path.read_text())


def verify(path, digest):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != digest:
        raise ValueError(f"Original checksum differs: {path.relative_to(ROOT)}")
    return actual


def distance(a, b):
    lat1, lat2 = [math.radians(float(t["latitude"])) for t in [a, b]]
    dlat = lat2 - lat1
    dlon = math.radians(float(a["longitude"]) - float(b["longitude"]))
    v = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(v)))


def clean_document(row):
    return (
        not row["reportConflict"]
        and not row["beneficiaryBreakdown"]["layoutClipped"]
        and row["chequeMatchesReportAmount"]
        and row["beneficiariesMatchCheque"]
        and bool(row["cheque"]["chequeDate"])
    )


def proposed_work(packet, area_id):
    identity = hashlib.sha256(packet["projectCode"].encode()).hexdigest()[:24]

    def receipt(suffix, title, source, locator, facts):
        return {
            "id": f"ppms-{identity}-{suffix}",
            "title": title,
            "url": source["url"],
            "documentHash": source["sha256"],
            "locator": locator,
            "retrievedAt": source["retrievedAt"][:10],
            "rawText": json.dumps(facts, ensure_ascii=False),
            "permission": "Official public report accessed. Source rights and owner publication review pending.",
        }

    project = receipt(
        "project",
        "Official PPMS project-register row",
        packet["projectSources"][0],
        packet["projectSources"][0]["locator"],
        {
            k: packet[k]
            for k in [
                "projectCode",
                "title",
                "scheme",
                "executionMode",
                "executantName",
                "sourceTechnicalSanctionDate",
                "sourceAdministrativeApprovalDate",
                "sourceWorkStatus",
            ]
        },
    )
    location = receipt(
        "location",
        "Official PPMS project-linked photo metadata",
        packet["photoLocationSource"],
        f"Exact Project Code {packet['projectCode']}; first listed photo coordinate",
        packet["markerCandidate"],
    )
    source_bill = packet["supportingBillDocuments"][0]
    bill = receipt(
        "bill",
        "Official PPMS supporting bill/cheque document",
        {**source_bill["source"], "url": source_bill["officialDownloadUrl"]},
        f"Project Code {packet['projectCode']}; Bill Serial {source_bill['billSerial']}; page 1",
        {
            "billSerial": source_bill["billSerial"],
            "amountInterpretation": "Under review; no paid amount claimed",
            "chequeDateMeaning": "Cheque date, not settlement date",
            "componentArithmetic": source_bill["arithmetic"],
        },
    )
    approval_date = None
    if packet["sourceAdministrativeApprovalDate"] != "-":
        approval_date = (
            datetime.strptime(packet["sourceAdministrativeApprovalDate"], "%d-%m-%Y")
            .date()
            .isoformat()
        )
    stages = [
        {
            "id": "sanction",
            "label": "Approval dates reported",
            "state": "pending",
            "date": approval_date,
            "amount": None,
            "description": "PPMS reports administrative and technical approval dates. Approval amount/order not established.",
            "reviewStatus": "pending",
            "receipts": [project],
        },
        {
            "id": "award",
            "label": "Departmental execution reported",
            "state": "pending",
            "date": None,
            "amount": None,
            "description": "Source execution mode is Department. Named executant is not inferred to be an awarded contractor or final payee. Work order under review.",
            "reviewStatus": "pending",
            "receipts": [project],
        },
        {
            "id": "payment",
            "label": "Bill evidence under review",
            "state": "pending",
            "date": None,
            "amount": None,
            "description": "An exact project/bill supporting document is preserved. Currency, gross/net basis, allocations and recipient settlement are not established; no paid amount or payment date claimed.",
            "reviewStatus": "pending",
            "receipts": [bill],
        },
        {
            "id": "completion",
            "label": "Completion evidence unavailable",
            "state": "pending",
            "date": None,
            "amount": None,
            "description": "Physical-completion date is blank in the source. Bill Final does not establish completion. No completion certificate reviewed.",
            "reviewStatus": "pending",
            "receipts": [project],
        },
    ]
    work = {
        "id": f"ppms-partial-{identity}",
        "title": packet["title"],
        "purpose": "Road and related infrastructure",
        "state": "Odisha",
        "district": packet["district"],
        "areaId": area_id,
        "financialYear": packet["sourceWorkStartFinancialYear"],
        "officialIds": [packet["projectCode"]],
        "location": [
            float(packet["markerCandidate"]["longitude"]),
            float(packet["markerCandidate"]["latitude"]),
        ],
        "locationPrecision": "source_point",
        "authority": None,
        "authorityReceipt": None,
        "stages": stages,
        "money": [],
        "physicalVerification": "Official project-linked photo location only. Actual project site/route and physical completion are unverified.",
        "summary": f"PPMS identifies this work in {packet['village']}, {packet['panchayat']}, under {packet['scheme']}. Source status: {packet['sourceWorkStatus']}. The point is a source photo coordinate; it is not a verified project site. Payment and completion evidence remain under review.",
        "roles": [
            {
                "id": f"ppms-{identity}-executant",
                "name": packet["executantName"],
                "role": "Source-named executant for departmental work; final payment recipient unverified",
                "organisation": None,
                "receipt": project,
                "photoUrl": None,
                "photoSource": None,
            }
        ],
        "demo": False,
    }
    return {
        "work": work,
        "locationReceipt": location,
        "locationReviewPending": True,
        "publicationApproved": False,
        "reviewStatus": "pending",
        "sourceReportedBillEvidence": source_bill,
        "blockingReviews": [
            "Source reuse/rights and explicit owner publication review",
            "Review point as official photo location; actual-site claim remains unsupported",
            "Confirm responsible implementing authority before approval",
        ],
        "strongerFinancialCardMissing": [
            "Sanction amount/order",
            "Departmental executant work order and allocations",
            "Project-specific amount unit and gross/net meanings",
            "Final-recipient payment evidence",
            "Completion certificate if a completed-work claim is sought",
        ],
    }


def refresh(url):
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname != "ppms.odisha.gov.in"
        or not parsed.path.startswith("/report/")
    ):
        raise ValueError("Only observed official report URLs are allowed")
    receipt = {
        "url": url,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "publicationApproved": False,
    }
    try:
        with urlopen(
            Request(url, headers={"User-Agent": "Hisaab official-record assessment"}), timeout=25
        ) as response:
            if urlparse(response.url).hostname != parsed.hostname:
                raise ValueError("Redirect leaves official source host")
            raw = response.read(5_000_001)
        if len(raw) > 5_000_000:
            raise ValueError("Response exceeds five MB bound")
        digest = hashlib.sha256(raw).hexdigest()
        path = OUT / f"odisha-live-{digest}.html"
        path.write_bytes(raw)
        receipt.update(status="preserved", sha256=digest, file=str(path.relative_to(ROOT)))
    except Exception as error:
        receipt.update(status="failed", error=str(error))
    return receipt


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--refresh", action="store_true")
    options = args.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    dossiers = read(BASE / "projects/balangir-dossiers.json")
    location_rows = read(BASE / "projects/expanded-location-assessment.json")["records"]
    locations = {r["projectCode"]: r for r in location_rows}
    documents = read(BASE / "state-payment-details/assessment.json")["records"]
    by_code = defaultdict(list)
    for row in documents:
        by_code[row["projectCode"]].append(row)
    project_sources = defaultdict(list)
    for source in dossiers["sources"]:
        path = BASE / "projects" / (source["sha256"] + ".html")
        verify(path, source["sha256"])
        for row in parse(path.read_text(), "exortTable"):
            code = row.get("Project Code")
            if code:
                project_sources[code].append(
                    {
                        **source,
                        "file": str(path.relative_to(ROOT)),
                        "locator": f"exortTable, source row {row.get('Sl. No.')}; exact Project Code {code}",
                    }
                )
    packets = []
    verified_documents = set()
    for dossier in dossiers["dossiers"]:
        code = dossier["projectCode"]
        project = dossier.get("project")
        if not project or dossier.get("projectConflict") or code not in locations:
            continue
        location = locations[code]
        path = BASE / "projects" / (location["source"]["sha256"] + ".html")
        verify(path, location["source"]["sha256"])
        tags = parse_geotags(path.read_text(), code)
        if tags != location["geotags"]:
            raise ValueError(f"Cached geotags differ from original for {code}")
        clean = [r for r in by_code[code] if clean_document(r)]
        if not clean or not tags:
            continue
        supporting = []
        for row in clean:
            p = BASE / "state-payment-details" / row["source"]["file"]
            verify(p, row["source"]["sha256"])
            verified_documents.add(row["source"]["sha256"])
            supporting.append(
                {
                    "billSerial": row["billSerial"],
                    "officialDownloadUrl": row["sourceUrl"],
                    "sourceReportUrl": row["reportSourceUrl"],
                    "source": {**row["source"], "file": str(p.relative_to(ROOT))},
                    "sourceReportAmount": row["reportAmount"],
                    "sourceChequeAmount": row["cheque"]["chequeAmount"],
                    "sourceChequeDate": row["cheque"]["chequeDate"],
                    "dateMeaning": "Cheque date, not settlement date",
                    "arithmetic": "source report amount equals cheque amount and sum of readable components",
                    "amountUnit": "Not established by the project-specific cheque PDF; do not present as rupees without source unit review",
                    "grossNetMeaning": "unresolved",
                    "recipientPaymentVerified": False,
                }
            )
        spread = max(distance(a, b) for a in tags for b in tags)
        packets.append(
            {
                "projectCode": code,
                "title": project["Project Name"],
                "district": project["District"],
                "block": project["Block"],
                "panchayat": project["Gram Panchayat / Ulb"],
                "village": project["Village / Ward"],
                "scheme": project["Scheme Name"],
                "workType": project["Work Type"],
                "executionMode": project["Mode of Execution"],
                "executantName": project["Executant in favour of Work order"],
                "executantRoleMeaning": "Named executant in departmental work; not inferred contractor or final payment recipient",
                "sourceTechnicalSanctionDate": project["Technical Sanction Date"],
                "sourceWorkStartFinancialYear": project["Work Start Fin Year"],
                "sourceAdministrativeApprovalDate": project["Administrative Approval Date"],
                "sourceWorkStatus": project["Work Status"],
                "sourceFinalBillDate": project["Final Bill Date"],
                "physicalCompletionDate": None
                if project["Physically Completed Date"] == "-"
                else project["Physically Completed Date"],
                "projectSources": project_sources[code],
                "photoLocationSource": {**location["source"], "file": str(path.relative_to(ROOT))},
                "photoLocations": [
                    {
                        k: t[k]
                        for k in ["stage", "latitude", "longitude", "sourceDate", "sourceStatus"]
                    }
                    for t in tags
                ],
                "sourceCoordinateSpreadMetres": round(spread, 2),
                "locationMeaning": "Official project-linked photo coordinates. Not an independently verified project site, road alignment or footprint.",
                "markerCandidate": {
                    "longitude": tags[0]["longitude"],
                    "latitude": tags[0]["latitude"],
                    "basis": "First source photo coordinate, not a computed centroid",
                    "actualSiteVerified": False,
                },
                "supportingBillDocuments": supporting,
                "safeClaims": [
                    "Official PPMS identifies this named project and its scheme/administrative area.",
                    "Official photo page is linked by the same exact project code.",
                    "Source reports administrative/technical dates and departmental execution as shown.",
                    "Preserved bill PDF is linked to this exact project/bill; component arithmetic agrees.",
                ],
                "withheldClaims": [
                    "Precise project footprint or independently checked site",
                    "Winning contractor and settled recipient payment",
                    "Sanction amount, gross/net expenditure and bill unit interpretation",
                    "Certified or physically verified completion",
                ],
                "publicationApproved": False,
            }
        )
    eligible = [
        r
        for r in packets
        if r["workType"] == "New Work"
        and re.search(r"^\s*(?:CONSTRUCTION|CONST[. ])", r["title"], re.I)
        and r["sourceTechnicalSanctionDate"] != "-"
        and r["sourceAdministrativeApprovalDate"] != "-"
    ]
    shortlist = []
    panchayats = set()
    for packet in sorted(
        eligible, key=lambda r: (r["sourceCoordinateSpreadMetres"], r["projectCode"])
    ):
        if packet["panchayat"] in panchayats:
            continue
        panchayats.add(packet["panchayat"])
        shortlist.append(packet)
        if len(shortlist) == 5:
            break
    live = []
    if options.refresh:
        urls = sorted(
            {p["photoLocationSource"]["url"] for p in shortlist}
            | {p["projectSources"][0]["url"] for p in shortlist}
        )
        with ThreadPoolExecutor(max_workers=3) as pool:
            live = list(pool.map(refresh, urls))
        by_url = {r["url"]: r for r in live}
        for packet in shortlist:
            receipt = by_url[packet["photoLocationSource"]["url"]]
            packet["livePhotoPage"] = receipt
            if receipt["status"] == "preserved":
                fresh_tags = parse_geotags(
                    (ROOT / receipt["file"]).read_text(), packet["projectCode"]
                )
                packet["livePhotoComparison"] = {
                    "projectIdentityPassed": True,
                    "photoRecordCount": len(fresh_tags),
                    "sameGeotagsAsPreservedEdition": fresh_tags
                    == locations[packet["projectCode"]]["geotags"],
                }
            receipt = by_url[packet["projectSources"][0]["url"]]
            packet["liveProjectPage"] = receipt
            if receipt["status"] == "preserved":
                rows = parse((ROOT / receipt["file"]).read_text(), "exortTable")
                matches = [r for r in rows if r.get("Project Code") == packet["projectCode"]]
                packet["liveProjectComparison"] = {
                    "exactCodeRows": len(matches),
                    "sameTitle": bool(matches and matches[0]["Project Name"] == packet["title"]),
                    "reportedStatus": matches[0].get("Work Status") if matches else None,
                }
    result = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "Private Balangir source-evidenced partial-card review; not settled-payment or completed-project approval",
        "joinedProjectLocationDossiers": len(location_rows),
        "projectsWithReadableConsistentBillEvidence": len(packets),
        "distinctPanchayatsInConsistentSubset": len({r["panchayat"] for r in packets}),
        "originalProjectPagesChecksumVerified": len(dossiers["sources"]),
        "originalPhotoPagesChecksumVerified": len(location_rows),
        "originalConsistentBillPdfsChecksumVerified": len(verified_documents),
        "executionModes": dict(
            Counter(
                r.get("project", {}).get("Mode of Execution")
                for r in dossiers["dossiers"]
                if r.get("project")
            )
        ),
        "fullFinancialCardsApproved": 0,
        "sourceReportedPartialCardsApproved": 0,
        "shortlist": shortlist,
        "packets": packets,
        "liveSourceChecks": live,
        "rankingMeaning": "New-work source label and construction title, both approval dates, readable consistent bill, distinct panchayat, then smallest photo-coordinate spread. Small spread does not verify site accuracy.",
        "nextActions": [
            "Review the first source photo point as a reported photo location, keeping actualSiteVerified=false.",
            "Treat department execution as department execution: request executant/work order rather than invent an awarded contractor.",
            "Keep payment amount absent in a public card until the specific source unit and accounting basis are established.",
            "Show source Bill Final separately from physical completion; all 155 saved physical-completion fields are blank.",
            "A restricted source-evidenced ongoing card need not claim settlement or completion. Explicit owner/source review remains required.",
        ],
        "privacy": "No bank accounts, phone numbers, beneficiary component identities or raw PDF text projected.",
    }
    destination = OUT / "odisha-source-evidenced-project-review-2026-10-25.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    registry = read(ROOT / "data/acquisition/districts.json")["areas"]
    matching_areas = [r for r in registry if r["state"] == "Odisha" and r["name"] == "Balangir"]
    if len(matching_areas) != 1:
        raise ValueError("Balangir does not have one exact saved registry match")
    proposed = {
        "checkedAt": result["checkedAt"],
        "scope": "Five private Work-shaped drafts only. No staging/publication or paid/completed-project claims.",
        "candidates": [proposed_work(packet, matching_areas[0]["id"]) for packet in shortlist],
    }
    (OUT / "odisha-proposed-works-2026-10-25.json").write_text(
        json.dumps(proposed, ensure_ascii=False, indent=2) + "\n"
    )
    print(
        json.dumps(
            {
                k: result[k]
                for k in [
                    "joinedProjectLocationDossiers",
                    "projectsWithReadableConsistentBillEvidence",
                    "distinctPanchayatsInConsistentSubset",
                    "originalConsistentBillPdfsChecksumVerified",
                ]
            }
        )
    )
    print(
        json.dumps(
            {
                "shortlist": [
                    {
                        "code": p["projectCode"],
                        "title": p["title"],
                        "photoSpreadMetres": p["sourceCoordinateSpreadMetres"],
                        "livePhotoComparison": p.get("livePhotoComparison"),
                        "liveProjectComparison": p.get("liveProjectComparison"),
                    }
                    for p in shortlist
                ],
                "liveChecks": len(live),
                "liveFailures": sum(r["status"] != "preserved" for r in live),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
