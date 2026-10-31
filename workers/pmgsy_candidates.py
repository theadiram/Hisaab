#!/usr/bin/env python3
"""Extract pending source candidates without inventing money units or geography."""

import json, re, hashlib
from datetime import datetime, timezone, timedelta, date
from pathlib import Path
from ingest import ROOT, DATA, ACQUISITION, atomic_json

VERSION = "pmgsy-tender-candidate-v1"


def source_date(value):
    if not value:
        return None
    match = re.fullmatch(r"/Date\((-?\d+)(?:[+-]\d{4})?\)/", str(value))
    if not match:
        raise ValueError("Unsupported source date encoding")
    value = datetime.fromtimestamp(
        int(match[1]) / 1000, timezone(timedelta(hours=5, minutes=30))
    ).date()
    if value.year < 2000:
        return None
    if value > date.today():
        raise ValueError("Future source date requires review")
    return value.isoformat()


def extract(manifest, rows):
    by_id = {}
    quarantine = []
    for index, row in enumerate(rows):
        try:
            if (
                not row.get("IMS_PR_ROAD_CODE")
                or not row.get("IMS_ROAD_NAME")
                or not row.get("MAST_DISTRICT_NAME")
            ):
                raise ValueError("Incomplete work identity")
            if not 2016 <= int(row["IMS_YEAR"]) <= 2026:
                continue
            identity = str(row["IMS_PR_ROAD_CODE"])
            by_id.setdefault(identity, []).append((index + 1, row))
        except (ValueError, TypeError, KeyError) as error:
            quarantine.append({"row": index + 1, "reason": str(error)})
    candidates = []
    for identity, versions in by_id.items():
        if len({json.dumps(row, sort_keys=True) for _, row in versions}) > 1:
            quarantine.extend(
                {"row": number, "reason": "Conflicting copies of source work identity"}
                for number, _ in versions
            )
            continue
        number, row = versions[0]
        try:
            sanction_date = source_date(row.get("IMS_SANCTIONED_DATE"))
            award_date = source_date(row.get("TEND_DATE_OF_AGREEMENT"))
        except (ValueError, OverflowError, OSError) as error:
            quarantine.append({"row": number, "reason": str(error)})
            continue
        digest = manifest["sha256"]
        receipt = {
            "id": f"{digest[:12]}:{identity}",
            "title": "Official PMGSY public road/tender report",
            "url": manifest["url"],
            "documentHash": digest,
            "locator": f"JSON row {number}; IMS_PR_ROAD_CODE {identity}; StateID {manifest['query']['StateID']}",
            "retrievedAt": manifest["retrievedAt"][:10],
            "rawText": json.dumps(row, ensure_ascii=False),
            "permission": "Source reuse permission not yet verified; private review only",
        }
        stages = []
        for stage, label, when, found in [
            ("sanction", "Sanction", sanction_date, True),
            ("award", "Award", award_date, bool(row.get("TEND_AGREEMENT_NUMBER"))),
            ("payment", "Payment", None, False),
            ("completion", "Completion", None, False),
        ]:
            stages.append(
                {
                    "id": stage,
                    "label": label,
                    "state": "pending" if found else "inaccessible",
                    "date": when,
                    "amount": None,
                    "description": "Source-linked record awaiting review; financial currency scale is not established by the response."
                    if found
                    else "This source response does not establish a payment ledger or a completion certificate. Reported work status is separate.",
                    "receipts": [receipt] if found else [],
                }
            )
        candidates.append(
            {
                "id": hashlib.sha256(("pmgsy:IMS_PR_ROAD_CODE:" + identity).encode()).hexdigest()[
                    :24
                ],
                "title": row["IMS_ROAD_NAME"],
                "purpose": "Roads",
                "state": row["MAST_STATE_NAME"],
                "district": row["MAST_DISTRICT_NAME"],
                "areaId": "",
                "financialYear": str(row["IMS_YEAR"]),
                "officialIds": [identity]
                + ([row["IMS_PACKAGE_ID"]] if row.get("IMS_PACKAGE_ID") else []),
                "location": None,
                "locationPrecision": "unknown",
                "authority": None,
                "authorityReceipt": None,
                "physicalVerification": "Not independently verified",
                "summary": "Official PMGSY road/tender source candidate. Reported work status: "
                + str(row.get("WORK_STATUS") or "unknown")
                + ". Financial units, fiscal-year interpretation and geography await review.",
                "demo": False,
                "stages": stages,
                "money": [],
                "review": {
                    "state": "pending",
                    "documentHash": digest,
                    "mappingVersion": VERSION,
                    "raw": row,
                    "blockers": [
                        "Source republication permission",
                        "Current LGD district match; PMGSY codes are not LGD codes",
                        "Financial units and original agreement/sanction evidence",
                        "Source sanction-year interpretation",
                        "Source date and work-status verification",
                    ],
                },
            }
        )
    return {
        "sourceId": manifest["sourceId"],
        "documentHash": manifest["sha256"],
        "candidates": candidates,
        "quarantine": quarantine,
        "parserVersion": VERSION,
    }


def run():
    progress = json.loads((DATA / "nationwide-ingestion.json").read_text())
    total = 0
    quarantined = 0
    for state in progress["statePartitions"]:
        if state["status"] != "original_preserved":
            continue
        digest = state["sha256"]
        manifest = json.loads((ACQUISITION / "documents" / f"{digest}.json").read_text())
        rows = json.loads((ROOT / manifest["original"]).read_text())
        result = extract(manifest, rows)
        atomic_json(ACQUISITION / "candidates" / f"{digest}.json", result)
        total += len(result["candidates"])
        quarantined += len(result["quarantine"])
        state["normalizedCandidates"] = len(result["candidates"])
        state["candidateQuarantine"] = len(result["quarantine"])
    progress["normalizedCandidates"] = total
    progress["candidateQuarantine"] = quarantined
    atomic_json(DATA / "nationwide-ingestion.json", progress)
    print(
        json.dumps(
            {
                "normalizedCandidates": total,
                "quarantinedSourceRows": quarantined,
                "publication": "not_published",
            }
        )
    )


if __name__ == "__main__":
    run()
