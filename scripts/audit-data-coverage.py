"""Read local evidence holdings; write aggregate coverage without changing source data."""

import json
import math
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "workers"))
from national_jurisdiction_matrix import JURISDICTIONS, canonical
from state_development_card_readiness import audit_state

inputs = {}


def load(name):
    path = ROOT / name
    inputs[name] = {
        "bytes": path.stat().st_size,
        "modifiedAt": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
    }
    return json.loads(path.read_text())


def ratio(n, d):
    return {"numerator": n, "denominator": d, "percent": round(100 * n / d, 2)}


def canonical_asset(name):
    return canonical({"Tamilnadu": "Tamil Nadu"}.get(name, name))


def main():
    registry = load("data/acquisition/districts.json")
    proposals = load("data/acquisition/geography-proposals.json")
    districts = {r["id"]: r for r in registry["areas"]}
    matched = {p["areaId"] for p in proposals["proposals"]}
    assert matched <= districts.keys(), "Proposals reference districts outside the saved register"
    db_path = ROOT / "data/acquisition/geography/assets.sqlite"
    with sqlite3.connect(f"file:{db_path}?mode=ro", uri=True) as db:
        assets_by_state = {
            canonical_asset(s): n
            for s, n in db.execute("select state,count(*) from assets group by state")
        }
        assets_by_kind = dict(db.execute("select kind,count(*) from assets group by kind"))
        historical_district_ids = db.execute(
            "select count(distinct state||':'||district_id) from assets"
        ).fetchone()[0]
    states = {}
    readiness = []
    for code, name in __import__("state_development_collection").STATES:
        data = load(f"data/acquisition/state-development/{code}/candidates.json")
        states[name] = {
            k: len(data[k])
            for k in ["budgetCandidates", "expenditureCandidates", "projectCandidates"]
        }
        readiness.append(audit_state(code, name, data["projectCandidates"]))
    state_totals = {k: sum(s[k] for s in states.values()) for k in next(iter(states.values()))}
    summary = load("data/state-development-acquisition.json")
    assert all(summary[k] == v for k, v in state_totals.items()), (
        "State summary needs reconciliation"
    )
    pmgsy = load("data/nationwide-ingestion.json")
    pmgsy_states = {canonical(s["state"]): s for s in pmgsy["statePartitions"]}
    raw_pmgsy_rows = sum(
        len(load(f"data/acquisition/pmgsy-national/state-{s['sourceStateCode']}.json"))
        for s in pmgsy["statePartitions"]
    )
    assert raw_pmgsy_rows == pmgsy["totalSourceRows"]
    candidate_count = 0
    candidate_ids = set()
    demos = 0
    for path in sorted((ROOT / "data/acquisition/candidates").glob("*.json")):
        data = load(str(path.relative_to(ROOT)))
        for row in data.get("candidates", []):
            if row.get("demo"):
                demos += 1
                continue
            if data.get("sourceId") == pmgsy["sourceId"]:
                candidate_count += 1
                candidate_ids.add(row["id"])
    assert candidate_count == pmgsy["normalizedCandidates"]
    roads = [
        json.loads(line)
        for line in (ROOT / "data/acquisition/geography/road-evidence-audit.jsonl")
        .read_text()
        .splitlines()
        if line.strip()
    ]
    assert {r["candidateId"] for r in roads} <= candidate_ids
    district_for_candidate = {p["candidateId"]: p["areaId"] for p in proposals["proposals"]}
    road_district_counts = Counter(
        district_for_candidate[r["candidateId"]]
        for r in roads
        if r["candidateId"] in district_for_candidate
    )
    treasury = load("data/acquisition/ppms/state-assessment/state-batch-assessment.json")
    payment_docs = load("data/acquisition/ppms/state-payment-details/assessment.json")
    linked = load("data/acquisition/ppms/projects/expanded-location-assessment.json")
    eligible_links = {
        url
        for r in treasury["records"]
        if r["Status"] != "Failed"
        for url in r["sourceLinks"]
        if url.startswith("https://ppms.odisha.gov.in/report/download-ifms-payment-details/")
    }
    assessed_links = {r["sourceUrl"] for r in payment_docs["records"]}
    assert assessed_links <= eligible_links
    catalogue = ROOT / "data/acquisition/mplads/review-catalogue/catalogue.sqlite"
    with sqlite3.connect(f"file:{catalogue}?mode=ro", uri=True) as db:
        mplads = {
            t: db.execute(f"select count(*) from {t}").fetchone()[0]
            for t in ["projects", "source_rows"]
        }
    lok = load("data/mplads-state-collection-assessment.json")
    rajya = load("data/mplads-rajya-state-collection-assessment.json")
    mplads_states = {canonical(r["name"]): r["rows"] for r in lok["states"]}
    for r in rajya["states"]:
        name = canonical(r["name"])
        mplads_states[name] = mplads_states.get(name, 0) + r["rows"]
    assert sum(mplads_states.values()) == mplads["source_rows"]
    field_counts = Counter()
    for s in readiness:
        field_counts.update(s["fieldCoverage"])
    matrix = []
    for name, kind in JURISDICTIONS:
        rd = [r for r in registry["areas"] if canonical(r["state"]) == name]
        matrix.append(
            {
                "jurisdiction": name,
                "type": kind,
                "historicalLocations": assets_by_state.get(name, 0),
                "savedRegistryDistricts": len(rd),
                "districtsWithCandidateNameMatches": sum(r["id"] in matched for r in rd),
                "pmgsyCandidates": pmgsy_states.get(name, {}).get("normalizedCandidates", 0),
                "mpladsSourceRows": mplads_states.get(name, 0),
                **states.get(name, {}),
            }
        )
    union_editions = []
    for path in sorted((ROOT / "data/acquisition/funding-inventory").glob("*.json")):
        d = load(str(path.relative_to(ROOT)))
        union_editions.append({"edition": path.stem, "fiscalRows": len(d["rows"])})
    release = load("data/acquisition/release-audit.json")
    result = {
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "Direct local-file and read-only SQLite audit. Source cutoffs vary; not a fresh nationwide collection or hosted database certification.",
        "historicalGeography": {
            "edition": "2022 archived mirror",
            "records": sum(assets_by_kind.values()),
            "byKind": assets_by_kind,
            "jurisdictionPresence": ratio(len(assets_by_state), len(JURISDICTIONS)),
            "missingJurisdictions": [n for n, _ in JURISDICTIONS if n not in assets_by_state],
            "historicalSourceDistrictIdentifiers": historical_district_ids,
            "warning": "Historical source district IDs are not current LGD district identities; locations do not establish spending.",
        },
        "districtCandidatePresence": {
            **ratio(len(matched), len(districts)),
            "registryImportedAt": registry["importedAt"],
            "candidateProposals": len(proposals["proposals"]),
            "districtsWithoutCandidateMatches": len(districts) - len(matched),
            "meaning": "Unapproved unique exact district-name matches for candidates, not reviewed sites or complete districts.",
        },
        "pmgsy": {
            "sourceRows": raw_pmgsy_rows,
            "sourceUniqueWorks": pmgsy["uniqueSourceWorks"],
            "workingCohortCandidates": candidate_count,
            "sourcePartitionPresence": ratio(len(pmgsy_states), len(JURISDICTIONS)),
            "geometryProposals": len(roads),
            "geometryProposalShareOfWorkingCohort": ratio(len(roads), candidate_count),
            "individualPaymentEvidence": sum(bool(r["individualPaymentEvidence"]) for r in roads),
            "completionCertificates": sum(bool(r["completionCertificate"]) for r in roads),
            "amountUnitVerifiedInSavedAudit": sum(bool(r["financialUnitVerified"]) for r in roads),
            "geometryCandidatesWithDistrictProposals": sum(road_district_counts.values()),
            "districtsWithGeometryCandidates": len(road_district_counts),
            "largestDistrictReviewQueues": [
                {"state": districts[k]["state"], "district": districts[k]["name"], "candidates": n}
                for k, n in road_district_counts.most_common(12)
            ],
        },
        "stateDevelopment": {
            **state_totals,
            "states": len(states),
            "completeCardsByFieldPresence": sum(s["completeFinancialWorkCards"] for s in readiness),
            "fieldCoverage": dict(field_counts),
            "warning": "Presence of fields alone is insufficient for evidence/publication approval.",
        },
        "odishaPpms": {
            "billRows": len(treasury["records"]),
            "projectCodes": len({r["Project Code"] for r in treasury["records"]}),
            "districtLabels": len({r["District"] for r in treasury["records"]}),
            "observedEligibleDocumentLinks": len(eligible_links),
            "assessedDocuments": len(payment_docs["records"]),
            "remainingObservedLinks": len(eligible_links - assessed_links),
            "documentAcquisitionProgress": ratio(len(assessed_links), len(eligible_links)),
            "sourceCoordinateProjects": len(linked["records"]),
            "photoLocationRecords": sum(len(r["geotags"]) for r in linked["records"]),
            "independentlyVerifiedSettlementsInAssessedDocuments": sum(
                bool(r["settlementVerified"]) for r in payment_docs["records"]
            ),
            "warning": "Document progress is within an observed source subset; not Odisha spending coverage. Source photo approval does not verify a project site.",
        },
        "mplads": {
            **mplads,
            "jurisdictionPartitions": len(mplads_states),
            "warning": "Catalogue project groups are not verified unique projects or payments.",
        },
        "nhidclSavedReview": {
            k: v
            for k, v in load(
                "data/acquisition/state-development/nhidcl-review/card-review-packets.json"
            ).items()
            if k
            in [
                "checkedAt",
                "candidatesChecked",
                "reviewPriorities",
                "statesChecked",
                "territoriesChecked",
                "jurisdictionsChecked",
                "scope",
            ]
        },
        "odishaBankReport": load("data/bank-payment-acquisition.json"),
        "bengaluruBillSample": load("data/bbmp-payment-source-assessment.json"),
        "panchayatPilot": load("data/panchayat-acquisition.json"),
        "jjmStateFinancialContext": load("data/jjm-acquisition.json"),
        "cagStateAccounts": {
            k: v
            for k, v in load(
                "data/acquisition/national-coverage/cag-state-accounts-manifest.json"
            ).items()
            if k in ["stateCount", "downloadedCount", "editionScope", "lastCheckedOn"]
        },
        "unionUtBudgetLines": load("data/acquisition/national-coverage/union-ut-demand-lines.json")[
            "rowCount"
        ],
        "savedFundingPublication": {
            k: v
            for k, v in load("data/acquisition/funding-publication-checkpoint.json").items()
            if k in ["checkedAt", "publishedRecords"]
        },
        "unionBudgetInventory": {
            "editions": union_editions,
            "fiscalRows": sum(e["fiscalRows"] for e in union_editions),
        },
        "westBengalJjm": load("data/wb-jjm-acquisition.json"),
        "puducherryAccounts": {
            k: v
            for k, v in load(
                "data/acquisition/national-coverage/puducherry-accounts-2026-27-index.json"
            ).items()
            if k
            in [
                "listedReports",
                "collectedReports",
                "pageCount",
                "voucherLineCount",
                "unlistedRegionMonthCombinations",
            ]
        },
        "publishedProjectBaseline": {
            "works": release["works"],
            "districtsCovered": release["districtsCovered"],
            "baselineAt": release["generatedAt"],
            "liveHostedRead": "Attempt on 2026-10-25 failed: fetch failed. Local baseline only.",
        },
        "milestones": [
            {
                "districtPresencePercentTarget": p,
                "districtsRequired": math.ceil(len(districts) * p / 100),
                "definition": "At least one reviewed complete project card per distinct district; not percent of projects, spending, population or land area.",
            }
            for p in [1, 5, 10, 25, 50, 100]
        ],
        "matrix": matrix,
        "demoCandidatesExcluded": demos,
        "limitations": [
            "Datasets overlap; never add these counts into a national project total.",
            "All-India project and comparable development-expenditure denominators are not established.",
            "Raw originals were not all rehashed in this aggregate audit.",
            "Counts from the 2026-10-06 district registry must be refreshed before a current national claim.",
        ],
        "inputs": inputs,
    }
    target = ROOT / "data/acquisition/national-coverage/local-data-audit-2026-10-25.json"
    target.write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {
                k: result[k]
                for k in [
                    "historicalGeography",
                    "districtCandidatePresence",
                    "stateDevelopment",
                    "odishaPpms",
                    "unionBudgetInventory",
                    "milestones",
                ]
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
