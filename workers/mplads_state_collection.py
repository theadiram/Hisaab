"""Bounded, checkpointed public expenditure collection using official state IDs."""

import argparse
import hashlib
import json
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from mplads_payment_assessment import assess

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "data/acquisition/mplads/public-script-review"
PRIVATE = ROOT / "data/acquisition/mplads/state-expenditure"
URL = "https://mplads.mospi.gov.in/rest/PreLoginDashboardData/getTilesReportData"


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=True) + "\n")


def request_body(state_id, house):
    if house not in (1, 2):
        raise ValueError("House must be an observed official dashboard value")
    return {
        "combo": f"{state_id},0,0,{house}",
        "key": "Expenditure on Completed and On-going Works as on Date",
    }


def validate_scope(records, state_name, house):
    if any(r["state"] != state_name or str(r["house"]) != str(house) for r in records):
        raise ValueError("Returned state/house does not match official request scope")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-states", type=int, default=6)
    parser.add_argument("--house", choices=("lok", "rajya"), default="lok")
    args = parser.parse_args()
    if not 1 <= args.max_states <= 6:
        parser.error("Use 1–6 states per invocation")
    house = 2 if args.house == "lok" else 1
    label = "Lok Sabha" if house == 2 else "Rajya Sabha"
    private = PRIVATE if house == 2 else ROOT / "data/acquisition/mplads/rajya-state-expenditure"
    output = ROOT / (
        "data/mplads-state-collection-assessment.json"
        if house == 2
        else "data/mplads-rajya-state-collection-assessment.json"
    )
    house_manifest = json.loads(
        (SCRIPTS / ("loksaba.json" if house == 2 else "rajyasaba.json")).read_text()
    )
    if (
        hashlib.sha256((SCRIPTS / house_manifest["file"]).read_bytes()).hexdigest()
        != house_manifest["sha256"]
    ):
        raise ValueError("Official house-switch script checksum mismatch")
    manifest = json.loads((SCRIPTS / "states.json").read_text())
    raw = (SCRIPTS / manifest["file"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
        raise ValueError("Official state list checksum mismatch")
    states = json.loads(raw)
    private.mkdir(parents=True, exist_ok=True)
    checkpoint = private / "checkpoint.json"
    results = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    pending = [s for s in states if str(s["STATE_ID"]) not in results]
    for state in pending[: args.max_states]:
        body = request_body(state["STATE_ID"], house)
        entry = {
            "state": state["STATE_NAME"],
            "stateId": state["STATE_ID"],
            "url": URL,
            "body": body,
            "retrievedAt": datetime.now(timezone.utc).isoformat(),
            "basis": "Official public state list and dashboard read-only report handler",
        }
        try:
            request = urllib.request.Request(
                URL,
                data=json.dumps(body).encode(),
                headers={"Content-Type": "application/json; charset=utf-8"},
                method="POST",
            )
            with urllib.request.urlopen(request, timeout=35) as response:
                original = response.read(20 * 1024 * 1024 + 1)
                entry["contentType"] = response.headers.get("Content-Type")
            if len(original) > 20 * 1024 * 1024:
                raise ValueError(
                    "Response exceeds 20 MiB; needs smaller official MP/tenure partition"
                )
            digest = hashlib.sha256(original).hexdigest()
            (private / (digest + ".json")).write_bytes(original)
            entry.update(sha256=digest, file=digest + ".json")
            records, summary = assess(original)
            validate_scope(records, state["STATE_NAME"], house)
            summary["scope"] = state["STATE_NAME"] + " · default " + label + " public filter"
            entry.update(status="assessed", summary=summary)
        except Exception as error:
            entry.update(status="needs-review", error=f"{type(error).__name__}: {str(error)[:200]}")
        results[str(state["STATE_ID"])] = entry
        write(checkpoint, results)
        print(
            json.dumps(
                {
                    "state": entry["state"],
                    "status": entry["status"],
                    "rows": entry.get("summary", {}).get("rows"),
                    "error": entry.get("error"),
                }
            ),
            flush=True,
        )
    assessed = [r for r in results.values() if r["status"] == "assessed"]
    work_ids = set()
    recommendation_work_ids = defaultdict(set)
    statuses = Counter()
    for entry in assessed:
        original = (private / entry["file"]).read_bytes()
        if hashlib.sha256(original).hexdigest() != entry["sha256"]:
            raise ValueError("State original checksum mismatch")
        records, _ = assess(original)
        validate_scope(records, entry["state"], house)
        for record in records:
            work_ids.add(record["workId"])
            recommendation_work_ids[record["recommendationId"]].add(record["workId"])
            statuses[record["sourcePaymentStatus"]] += 1
    public = {
        "source": "Official MPLADS public expenditure reports",
        "scope": "Default "
        + label
        + " filter; not all schemes, tenures/statuses or government payments",
        "house": house,
        "observedStatePartitions": len(states),
        "attemptedStatePartitions": len(results),
        "assessedStatePartitions": len(assessed),
        "failedPartitions": len(results) - len(assessed),
        "expenditureRows": sum(r["summary"]["rows"] for r in assessed),
        "encodingIssueRows": sum(r["summary"]["encodingIssueRows"] for r in assessed),
        "approvedPayments": 0,
        "independentlyVerifiedSettlementPayments": 0,
        "states": [
            {
                "name": s["STATE_NAME"],
                "status": results.get(str(s["STATE_ID"]), {}).get("status", "pending"),
                "rows": results.get(str(s["STATE_ID"]), {}).get("summary", {}).get("rows"),
            }
            for s in states
        ],
    }
    public.update(
        distinctWorkIds=len(work_ids),
        sourceStatusCounts=dict(statuses),
        recommendationIdsWithMultipleFullWorkIds=sum(
            len(v) > 1 for v in recommendation_work_ids.values()
        ),
    )
    write(output, public)


if __name__ == "__main__":
    main()
