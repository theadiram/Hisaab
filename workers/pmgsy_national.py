#!/usr/bin/env python3
"""Preserve the state reports used by the official public PMGSY dashboard.
No CAPTCHA bypass, permission inference, paid API, or automatic publication.
"""

import hashlib, json, urllib.request, time
from pathlib import Path
from datetime import datetime, timezone
from ingest import ROOT, DATA, ACQUISITION, atomic_json

BASE = "https://pmgsy.dord.gov.in/dbweb"
SOURCE = "pmgsy-dashboard"
VERSION = "pmgsy-public-tender-report-v1"
MAX_BYTES = 64 * 1024 * 1024


def request_report(endpoint, params):
    request = urllib.request.Request(
        BASE + endpoint,
        data=json.dumps(params).encode(),
        headers={
            "Content-Type": "application/json",
            "Referer": BASE + "/",
            "User-Agent": "Hisaab public report assessment; sequential state requests",
        },
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError("Report exceeds 64 MB; needs an assessed district partition")
        if response.status != 200:
            raise ValueError("Report unavailable")
    data = json.loads(body)
    if not isinstance(data, list):
        raise ValueError("Unexpected report schema")
    return body, data


def assess(rows, state_code):
    seen = set()
    duplicates = 0
    ten_year = 0
    districts = set()
    conflicts = set()
    identities = {}
    quarantine = []
    for index, row in enumerate(rows):
        if row.get("MAST_STATE_CODE") != state_code:
            raise ValueError("State identity mismatch")
        if (
            not row.get("IMS_PR_ROAD_CODE")
            or not row.get("IMS_ROAD_NAME")
            or not row.get("MAST_DISTRICT_NAME")
        ):
            quarantine.append({"row": index + 1, "reason": "Incomplete source work identity"})
            continue
        identity = str(row["IMS_PR_ROAD_CODE"])
        serialized = json.dumps(row, sort_keys=True)
        if identity in seen:
            duplicates += 1
            if identities[identity] != serialized:
                conflicts.add(identity)
            continue
        seen.add(identity)
        identities[identity] = serialized
        districts.add(str(row["MAST_DISTRICT_CODE"]))
        year = int(row["IMS_YEAR"])
        if 2016 <= year <= 2026:
            ten_year += 1
    return {
        "sourceRows": len(rows),
        "uniqueSourceWorks": len(seen),
        "duplicateRows": duplicates,
        "conflictingIdentities": len(conflicts),
        "districtNames": len(districts),
        "withinYearWindow": ten_year,
        "quarantinedRows": len(quarantine),
        "quarantine": quarantine,
    }


def run():
    folder = ACQUISITION / "pmgsy-national"
    folder.mkdir(parents=True, exist_ok=True)
    body, states = request_report(
        "/ChiefSecretary/GetCSDashboardNationalData", {"StateID": 0, "DistrictID": 0, "SchemeID": 0}
    )
    atomic_json(folder / "state-overview.json", states)
    if not states or len({r["STATE_CODE"] for r in states}) != len(states):
        raise ValueError("State overview absent or ambiguous")
    result = {
        "sourceId": SOURCE,
        "sourceUrl": BASE,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "yearWindow": "2016–2026 sanction-year assessment; not a full ten-year ledger",
        "publication": "pending_permission_geography_and_evidence_review",
        "statePartitions": [],
    }
    for state in states:
        code = state["STATE_CODE"]
        name = state["STATE_NAME"]
        entry = {"sourceStateCode": code, "state": name, "status": "pending"}
        try:
            original = folder / f"state-{code}.json"
            if original.exists():
                body = original.read_bytes()
                rows = json.loads(body)
            else:
                body, rows = request_report(
                    "/ChiefSecretary/GetRoadTenderDetails",
                    {"StateID": code, "DistrictID": 0, "SchemeID": 0},
                )
                original.write_bytes(body)
            entry.update(assess(rows, code))
            digest = hashlib.sha256(body).hexdigest()
            destination = DATA / "originals" / SOURCE / digest
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(body)
            manifest = {
                "sourceId": SOURCE,
                "sourceName": "Official PMGSY public dashboard road/tender reports",
                "sourceFamily": "National schemes",
                "sha256": digest,
                "url": BASE + "/ChiefSecretary/GetRoadTenderDetails",
                "contextUrl": BASE,
                "query": {"StateID": code, "DistrictID": 0, "SchemeID": 0},
                "partition": name,
                "permission": "unverified; private source assessment only",
                "permissionStatus": "unverified",
                "retrievedAt": datetime.fromtimestamp(
                    original.stat().st_mtime, timezone.utc
                ).isoformat(),
                "original": str(destination.relative_to(ROOT)),
                "contentType": "application/json",
                "parserVersion": VERSION,
            }
            atomic_json(ACQUISITION / "documents" / f"{digest}.json", manifest)
            entry.update(
                {
                    "status": "original_preserved" if rows else "empty_response_needs_assessment",
                    "sha256": digest,
                    "publication": "not_published",
                }
            )
            print(
                json.dumps(
                    {
                        "state": name,
                        "sourceRows": len(rows),
                        "uniqueSourceWorks": entry["uniqueSourceWorks"],
                        "publication": "not_published",
                    }
                ),
                flush=True,
            )
        except Exception as error:
            entry.update({"status": "access_failed", "reason": str(error)[:180]})
            print(json.dumps({"state": name, "status": "access_failed"}), flush=True)
        result["statePartitions"].append(entry)
        result["totalSourceRows"] = sum(x.get("sourceRows", 0) for x in result["statePartitions"])
        result["uniqueSourceWorks"] = sum(
            x.get("uniqueSourceWorks", 0) for x in result["statePartitions"]
        )
        result["withinYearWindow"] = sum(
            x.get("withinYearWindow", 0) for x in result["statePartitions"]
        )
        atomic_json(DATA / "nationwide-ingestion.json", result)
        time.sleep(1)
    result["overviewPartitions"] = len(states)
    result["successfulPartitions"] = sum(
        x["status"] == "original_preserved" for x in result["statePartitions"]
    )
    result["currentLgdCoverageVerified"] = False
    atomic_json(DATA / "nationwide-ingestion.json", result)
    return result


if __name__ == "__main__":
    result = run()
    print(
        json.dumps(
            {
                "sourceRows": result["totalSourceRows"],
                "uniqueSourceWorks": result["uniqueSourceWorks"],
                "successfulPartitions": result["successfulPartitions"],
                "overviewPartitions": result["overviewPartitions"],
                "publication": "not_published",
            }
        )
    )
