"""Prepare private source-evidenced road review packets, never publication decisions.

Run with the workspace bundled Python (pdfplumber is required).
"""

import hashlib
import json
import re
import sqlite3
from copy import deepcopy
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data/acquisition/first-dots"


def read(name):
    return json.loads((ROOT / name).read_text())


def save(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_key(r):
    return (
        r["MAST_STATE_CODE"],
        r["MAST_DISTRICT_CODE"],
        str(r["IMS_PR_ROAD_CODE"]),
        r["IMS_YEAR"],
        r["IMS_BATCH"],
        r["IMS_ROAD_NAME"].strip().casefold(),
    )


def date(value):
    try:
        return datetime.strptime(value.strip(), "%d-%m-%Y").date().isoformat()
    except (ValueError, AttributeError):
        return None


def main():
    candidates = {}
    for p in (ROOT / "data/acquisition/candidates").glob("*.json"):
        data = json.loads(p.read_text())
        if data.get("sourceId") == "pmgsy-dashboard":
            candidates.update({c["id"]: c for c in data["candidates"]})
    sources = {s["sha256"]: s for s in read("data/acquisition/geography/manifest.json")["files"]}
    matches = [
        json.loads(line)
        for line in (ROOT / "data/acquisition/geography/road-matches.jsonl")
        .read_text()
        .splitlines()
    ]
    db = sqlite3.connect(
        f"file:{ROOT / 'data/acquisition/geography/assets.sqlite'}?mode=ro", uri=True
    )
    db.row_factory = sqlite3.Row
    used_originals = {}
    checked = []
    for m in matches:
        c = candidates[m["candidateId"]]
        raw = c["review"]["raw"]
        for asset_id in m["geographyAssetIds"]:
            a = db.execute("select * from assets where id=?", (asset_id,)).fetchone()
            ar = json.loads(a["source_fields"])
            key = (
                a["state_id"],
                a["district_id"],
                a["source_identity"],
                ar.get("IMS_YEAR"),
                ar.get("IMS_BATCH"),
                a["title"].strip().casefold(),
            )
            assert key == source_key(raw), "Six-field source identity changed"
            assert a["source_hash"] == m["geographyDocumentHash"]
        for h, path in [
            (
                m["workDocumentHash"],
                ROOT / "data/originals/pmgsy-dashboard" / m["workDocumentHash"],
            ),
            (m["geographyDocumentHash"], ROOT / sources[m["geographyDocumentHash"]]["original"]),
        ]:
            if h not in used_originals:
                assert digest(path) == h, "Source checksum mismatch"
                used_originals[h] = str(path.relative_to(ROOT))
        checked.append((c, m))
    # Single source feature avoids choosing between repeated/segmented geometries.
    district_proposals = {
        r["candidateId"]: r["areaId"]
        for r in read("data/acquisition/geography-proposals.json")["proposals"]
    }
    recovered_path = OUT / "district-recovery.json"
    recovered_districts = (
        {r["candidateId"]: r["areaId"] for r in json.loads(recovered_path.read_text())["proposals"]}
        if recovered_path.exists()
        else {}
    )
    by_state = {}
    for c, m in sorted(
        checked,
        key=lambda pair: (
            pair[0]["state"],
            pair[0]["id"] not in district_proposals,
            pair[0]["district"],
            pair[0]["id"],
        ),
    ):
        if (
            m["geometryFeatures"] == 1
            and c["review"]["raw"].get("TEND_AGREEMENT_NUMBER")
            and c["stages"][1].get("date")
        ):
            by_state.setdefault(c["state"], (c, m))
    packets = []
    for c, m in by_state.values():
        source = c["stages"][0]["receipts"][0]
        packets.append(
            {
                "candidateId": c["id"],
                "officialRoadId": m["officialRoadId"],
                "title": c["title"],
                "state": c["state"],
                "district": c["district"],
                "sourceYear": c["financialYear"],
                "markerOnArchivedSourceLine": m["markerOnLine"],
                "geometry": m["geometry"],
                "sourceReportedSanctionDate": c["stages"][0].get("date"),
                "sourceReportedAgreementDate": c["stages"][1].get("date"),
                "sourceReportedAgreementReference": c["review"]["raw"].get("TEND_AGREEMENT_NUMBER"),
                "sourceReportedWorkStatus": c["review"]["raw"].get("WORK_STATUS"),
                "financialAmountsRupees": None,
                "paidAmountRupees": None,
                "paymentRecipient": None,
                "source": {
                    "url": source["url"],
                    "sha256": source["documentHash"],
                    "locator": source["locator"],
                    "retrievedAt": source["retrievedAt"],
                },
                "geographySource": {
                    **sources[m["geographyDocumentHash"]],
                    "featureRow": m["sourceRow"],
                    "assetId": m["geographyAssetId"],
                },
                "checks": {
                    "sixSourceAttributesRechecked": True,
                    "sourceOriginalChecksumsMatched": True,
                    "singleGeometryFeature": True,
                    "independentlyVerifiedActualSite": False,
                },
                "proposedPublicLabel": "Official road record with archived proposal route; actual site unverified. Financial amounts and payment evidence unavailable.",
                "requiredOwnerDecisions": [
                    "Source reuse review for official PMGSY report",
                    "Approve only archived proposal-route precision, never verified physical location",
                    "Evidence-level publication review",
                ],
                "publicationApproved": False,
                "fullPaymentBackedCard": False,
            }
        )
    summary = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "allGeometryCandidatesRechecked": len(checked),
        "distinctOriginalChecksumsReverified": len(used_originals),
        "originals": used_originals,
        "singleFeatureCandidates": sum(m["geometryFeatures"] == 1 for c, m in checked),
        "diverseReviewPackets": len(packets),
        "distinctSourceDistrictPairs": len({(p["state"], p["district"]) for p in packets}),
        "packets": packets,
        "publicationApproved": False,
        "scope": "Evidence-limited official-record dots with archived proposal routes; no verified sites, payment totals or certificates.",
    }
    save("roads-evidence-limited-review.json", summary)
    save(
        "roads-evidence-limited-preview.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": p["geometry"],
                    "properties": {
                        k: p[k]
                        for k in [
                            "candidateId",
                            "officialRoadId",
                            "title",
                            "state",
                            "district",
                            "proposedPublicLabel",
                            "publicationApproved",
                        ]
                    },
                }
                for p in packets
            ],
        },
    )
    work_candidates = []
    for p in packets:
        c = deepcopy(candidates[p["candidateId"]])
        c["location"] = p["markerOnArchivedSourceLine"]
        c["locationPrecision"] = "source_point"
        c["areaId"] = district_proposals.get(c["id"], recovered_districts.get(c["id"], ""))
        c["money"] = []
        c["physicalVerification"] = (
            "Unverified actual site. Marker is an original vertex on an archived 2022 proposal route; not a building, completion or payment location."
        )
        c["summary"] = p["proposedPublicLabel"]
        geo = p["geographySource"]
        geography_receipt = {
            "id": f"{geo['sha256'][:12]}:road:{p['officialRoadId']}",
            "title": "Archived GeoSadak-derived proposal route from DataMeet release mirror",
            "url": geo["url"],
            "documentHash": geo["sha256"],
            "locator": f"{geo['path']}; source feature row {geo['featureRow']}; MRL_ID {p['officialRoadId']}",
            "retrievedAt": geo["retrievedAt"][:10],
            "rawText": json.dumps(
                {
                    "sourceEdition": geo["sourceEdition"],
                    "assetId": geo["assetId"],
                    "markerOnSourceLine": c["location"],
                    "identityMatchAttributes": matches[0]["comparison"],
                    "actualSiteVerified": False,
                },
                ensure_ascii=False,
            ),
            "permission": "Official 2022 release names DataMeet and Government Open Data License India; attribution required. Owner source/use review pending.",
        }
        c["geographyReceipt"] = geography_receipt
        c["assetId"] = geo["assetId"]
        c["review"] = {
            **c["review"],
            "state": "pending",
            "publicationApproved": False,
            "proposedLocationOnly": True,
            "districtAssociationBasis": (
                "existing_exact_name_proposal"
                if c["id"] in district_proposals
                else "new_state_label_correspondence_proposal"
                if c["id"] in recovered_districts
                else "unresolved"
            ),
            "blockers": p["requiredOwnerDecisions"]
            + ["Source year is a sanction year; fiscal-year interpretation remains pending."],
        }
        for stage in c["stages"]:
            stage["amount"] = None
            stage["reviewStatus"] = "pending"
        work_candidates.append(c)
    save(
        "roads-work-candidates.json",
        {
            "version": "hisaab-private-work-proposals/1",
            "candidates": work_candidates,
            "publicationApproved": False,
            "warning": "Machine-readable Work-shaped proposals, not approved intake or public records. GeographyReceipt and review hold extra lineage. Source-point precision means an archived route vertex only; source year is not a verified fiscal year.",
            "candidatesWithExistingDistrictProposals": sum(
                c["id"] in district_proposals for c in work_candidates
            ),
            "candidatesWithNewDistrictCorrespondenceProposals": sum(
                c["id"] not in district_proposals and c["id"] in recovered_districts
                for c in work_candidates
            ),
        },
    )
    april_path = (
        OUT / "roads-originals/62ce4ad6f870b22c460c75aac07554114ed63a670013a12de6ee2fd3b1479407.pdf"
    )
    assert digest(april_path) == april_path.stem
    rows = {}
    with pdfplumber.open(april_path) as doc:
        for page_no, page in enumerate(doc.pages, 1):
            for table in page.extract_tables():
                for row in table:
                    if len(row) == 21 and (row[0] or "").isdigit():
                        upn = re.sub(r"\s+", "", row[3] or "")
                        assert upn not in rows, "Repeated source UPN requires manual interpretation"
                        rows[upn] = (page_no, row)
    recovered = []
    current = read("data/acquisition/state-development/nhidcl-review/card-review-packets.json")
    for c in current["records"]:
        found = rows.get(c["officialProjectId"])
        if not found:
            continue
        page, row = found
        sanction = date(row[11])
        if not sanction:
            continue
        facts = c["checkedFacts"]
        try:
            contract_same = Decimal(row[10].replace(",", "")) * Decimal(10000000) == Decimal(
                facts["contractAmountRupees"]
            )
        except Exception:
            contract_same = False
        recovered.append(
            {
                "candidateId": c["candidateId"],
                "officialProjectId": c["officialProjectId"],
                "title": c["title"],
                "sourceStateLabel": row[1].replace("\n", " "),
                "aprilSourceSanctionDate": sanction,
                "aprilSourceTitle": row[5].replace("\n", " "),
                "sameAwardDateAcrossEditions": date(row[12]) == facts.get("awardDate"),
                "sameContractAmountAcrossEditions": contract_same,
                "source": {
                    "url": "https://www.nhidcl.com/sites/default/files/2026-05/nhidcl_projects_status_as_on_30.04.2026_for_website.pdf",
                    "sha256": april_path.stem,
                    "file": str(april_path.relative_to(ROOT)),
                    "page": page,
                    "row": row[0],
                    "column": "Date of Sanction",
                    "edition": "30 April 2026",
                },
                "meaning": "April source reports a sanction date for this exact UPN. No inference of current/revised sanction amount, original sanction-order contents, actual geography, or payment.",
                "publicationApproved": False,
            }
        )
    save(
        "roads-nhidcl-sanction-date-recovery.json",
        {
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "sourceRowsExtracted": len(rows),
            "currentPacketsConsidered": len(current["records"]),
            "exactUpnSanctionDatesRecovered": len(recovered),
            "sameAwardDateAndContractAmount": sum(
                r["sameAwardDateAcrossEditions"] and r["sameContractAmountAcrossEditions"]
                for r in recovered
            ),
            "records": recovered,
            "publicationApproved": False,
        },
    )
    print(
        json.dumps(
            {
                "roadCandidatesRechecked": len(checked),
                "sourceChecksumsMatched": len(used_originals),
                "diverseRoadPackets": len(packets),
                "nhidclSanctionDatesRecovered": len(recovered),
            }
        )
    )


if __name__ == "__main__":
    main()
