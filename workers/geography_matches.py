#!/usr/bin/env python3
"""Create private geography proposals using exact cross-source attributes, never publish."""

import json, sqlite3, collections, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run():
    db = sqlite3.connect(ROOT / "data/acquisition/geography/assets.sqlite")
    db.row_factory = sqlite3.Row
    index = collections.defaultdict(list)
    for part in json.loads((ROOT / "data/nationwide-ingestion.json").read_text())[
        "statePartitions"
    ]:
        if part["status"] != "original_preserved":
            continue
        h = part["sha256"]
        extraction = json.loads((ROOT / f"data/acquisition/candidates/{h}.json").read_text())
        for c in extraction["candidates"]:
            r = c["review"]["raw"]
            key = (
                r.get("MAST_STATE_CODE"),
                r.get("MAST_DISTRICT_CODE"),
                str(r.get("IMS_PR_ROAD_CODE")),
                r.get("IMS_YEAR"),
                r.get("IMS_BATCH"),
                r.get("IMS_ROAD_NAME", "").strip().casefold(),
            )
            index[key].append((c, h))
    counts = collections.Counter()
    output = ROOT / "data/acquisition/geography/road-matches.jsonl"
    matched_candidates = collections.Counter()
    proposals = []
    for asset in db.execute("select * from assets where kind='road'"):
        raw = json.loads(asset["source_fields"])
        key = (
            asset["state_id"],
            asset["district_id"],
            asset["source_identity"],
            raw.get("IMS_YEAR"),
            raw.get("IMS_BATCH"),
            asset["title"].strip().casefold(),
        )
        found = index.get(key, [])
        counts["sourceProposals"] += 1
        if len(found) != 1:
            counts["unmatchedOrAmbiguous"] += 1
            continue
        candidate, h = found[0]
        matched_candidates[candidate["id"]] += 1
        proposals.append(
            {
                "candidateId": candidate["id"],
                "workDocumentHash": h,
                "geographyAssetId": asset["id"],
                "geographyDocumentHash": asset["source_hash"],
                "sourceRow": asset["source_row"],
                "officialRoadId": asset["source_identity"],
                "comparison": [
                    "state source code",
                    "district source code",
                    "original road identifier",
                    "sanction year",
                    "batch",
                    "exact normalized title",
                ],
                "status": "private_proposal_review_required",
                "reason": "Archived proposal geometry matches exact attributes; identity semantics, edition changes and publication permission still require review.",
                "geometry": json.loads(asset["geometry"]),
                "markerOnLine": [asset["lng"], asset["lat"]],
            }
        )
    grouped = collections.defaultdict(list)
    for proposal in proposals:
        grouped[proposal["candidateId"]].append(proposal)
    with output.open("w") as f:
        for candidate_id, segments in grouped.items():
            unique = {json.dumps(p["geometry"], sort_keys=True): p for p in segments}
            parts = []
            for part in unique.values():
                g = part["geometry"]
                parts.extend(
                    g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
                )
            joined = {
                **segments[0],
                "geographyAssetIds": [p["geographyAssetId"] for p in segments],
                "sourceRows": [p["sourceRow"] for p in segments],
                "geometry": {"type": "MultiLineString", "coordinates": parts},
                "geometryFeatures": len(segments),
                "distinctGeometryFeatures": len(unique),
                "approvalRequired": True,
            }
            if len(segments) > 1:
                joined["reason"] = (
                    "Multiple source feature rows share the six exact attributes. All source line segments are preserved for manual scope/identity review; no silent nearest-road selection."
                )
                counts["projectsWithMultipleFeatures"] += 1
            else:
                counts["projectsWithSingleFeature"] += 1
            f.write(json.dumps(joined, ensure_ascii=False) + "\n")
            counts["projectsWithExactAttributeProposals"] += 1
    report = {
        "method": "Six exact source attributes and unique spending candidate; all matching geometry segments retained for manual scope and identity review",
        "counts": dict(counts),
        "published": 0,
        "approvedPaymentLinks": 0,
        "geographyEdition": "2022 archived mirror",
        "sourceFiles": "58 preserved archives; 29 source state files",
    }
    (ROOT / "data/geography-match-status.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    run()
