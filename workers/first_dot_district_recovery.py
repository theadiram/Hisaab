"""Recover explicit state-name correspondence proposals; never approve geography."""

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from lgd_registry import key, match

ROOT = Path(__file__).resolve().parents[1]
STATE_CORRESPONDENCE = {
    "keralam": {
        "registryName": "Kerala",
        "sourceUrl": "https://forest.kerala.gov.in/en/kerala-at-a-glance/",
        "basis": "Official Kerala Forest Department identifies Kerala as also known as Keralam. This establishes name correspondence, not project geography or a boundary-change allocation.",
    },
}


def propose(candidate, index, registry_hash):
    """Only exact district names within an explicitly documented state alias."""
    if match(candidate["state"], candidate["district"], index):
        return None
    alias = STATE_CORRESPONDENCE.get(key(candidate["state"]))
    if not alias:
        return None
    area = match(alias["registryName"], candidate["district"], index)
    if not area:
        return None
    return {
        "candidateId": candidate["id"],
        "areaId": area,
        "sourceStateName": candidate["state"],
        "registryStateName": alias["registryName"],
        "sourceDistrictName": candidate["district"],
        "registryHash": registry_hash,
        "method": "documented_state_name_correspondence_unique_exact_district_name",
        "correspondenceSourceUrl": alias["sourceUrl"],
        "correspondenceBasis": alias["basis"],
        "sourceReceipt": {
            k: candidate["stages"][0]["receipts"][0].get(k)
            for k in ["url", "documentHash", "locator"]
        },
        "approved": False,
        "actualSiteVerified": False,
        "paymentLinked": False,
    }


def main():
    registry = json.loads((ROOT / "data/acquisition/districts.json").read_text())
    previous = json.loads((ROOT / "data/acquisition/geography-proposals.json").read_text())
    progress = json.loads((ROOT / "data/nationwide-ingestion.json").read_text())
    index = {}
    for area in registry["areas"]:
        index.setdefault((key(area["state"]), key(area["name"])), []).append(area["id"])
    previous_ids = {p["candidateId"] for p in previous["proposals"]}
    previous_areas = {p["areaId"] for p in previous["proposals"]}
    additions = []
    for partition in progress["statePartitions"]:
        if key(partition["state"]) not in STATE_CORRESPONDENCE:
            continue
        path = ROOT / "data/acquisition/candidates" / (partition["sha256"] + ".json")
        for candidate in json.loads(path.read_text())["candidates"]:
            proposal = propose(candidate, index, registry["sourceHash"])
            if proposal and candidate["id"] not in previous_ids:
                additions.append(proposal)
    assert len({p["candidateId"] for p in additions}) == len(additions)
    areas_by_id = {a["id"]: a for a in registry["areas"]}
    count = Counter(p["areaId"] for p in additions)
    result = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "Private district association recovery only; existing registry/proposals remain unchanged.",
        "baselineCandidateProposals": len(previous_ids),
        "additionalCandidateProposals": len(additions),
        "baselineDistrictPresence": len(previous_areas),
        "additionalDistrictPresence": len(set(count) - previous_areas),
        "combinedProposedDistrictPresence": len(previous_areas | set(count)),
        "savedRegistryDistrictCount": len(registry["areas"]),
        "districts": [
            {"areaId": area, "name": areas_by_id[area]["name"], "candidates": n}
            for area, n in sorted(count.items())
        ],
        "proposals": additions,
        "publicationApproved": False,
        "limitations": [
            "District-name association does not establish actual project coordinates.",
            "No fuzzy district names, similar names, historic boundary splits or payment joins are inferred.",
            "Official correspondence page was inspected through web search; raw source HTML is not preserved here. Original-source capture and owner review remain pending.",
            "Counts use the saved 6 October 2026 registry, not a current nationwide denominator.",
        ],
    }
    output = ROOT / "data/acquisition/first-dots/district-recovery.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: v for k, v in result.items() if k not in ["proposals", "districts"]}))


if __name__ == "__main__":
    main()
