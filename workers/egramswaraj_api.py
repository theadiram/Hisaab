"""Bounded private acquisition from the NIC-documented eGramSwaraj services.

No guessed endpoints, authentication bypass or automatic publication. Original
responses are immutable by checksum; failures leave previous acquisitions intact.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
METHODS = {
    "planning": "getLbApprovedActivityData",
    "technical": "getLbTechnicalApprovalData",
    "administrative": "getLbAdmApprovalData",
    "physical": "getLbPhysicalProgressData",
}


def index_records(records):
    if not isinstance(records, list):
        raise ValueError("Expected a JSON record list")
    grouped = {}
    for record in records:
        code = record.get("activityCd")
        if not isinstance(code, int) or isinstance(code, bool):
            raise ValueError("Missing official activity code")
        grouped.setdefault(str(code), []).append(record)
    return grouped


def assess(modules):
    indexes = {name: index_records(rows) for name, rows in modules.items()}
    codes = set().union(*(set(index) for index in indexes.values()))
    projects = []
    for code in sorted(codes):
        physical = indexes.get("physical", {}).get(code, [])
        geotags = []
        for record in physical:
            for upload in record.get("physicalProgressAssetStageUploadWebService", []) or []:
                try:
                    lat = float(upload["latitude"])
                    lon = float(upload["longitude"])
                except (ValueError, KeyError, TypeError):
                    continue
                if -90 <= lat <= 90 and -180 <= lon <= 180 and (lat != 0 or lon != 0):
                    geotags.append(
                        dict(
                            fileUploadId=upload.get("fileUploadId"),
                            latitude=upload["latitude"],
                            longitude=upload["longitude"],
                            reviewStatus="pending",
                            basis="Official activity-linked upload geotag; location accuracy unverified",
                        )
                    )
        projects.append(
            dict(
                activityId=code,
                planning=indexes.get("planning", {}).get(code, []),
                technical=indexes.get("technical", {}).get(code, []),
                administrative=indexes.get("administrative", {}).get(code, []),
                physical=physical,
                reportedGeotags=geotags,
                paymentLinks=[],
                exactGeography=None,
                approved=False,
            )
        )
    return dict(
        projects=projects,
        counts={name: len(index) for name, index in indexes.items()},
        uniqueActivityIds=len(codes),
        activitiesWithReportedGeotags=sum(bool(p["reportedGeotags"]) for p in projects),
        paymentLinks=0,
        verifiedCoordinates=0,
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--state", type=int, required=True)
    parser.add_argument("--local-body", type=int, required=True)
    parser.add_argument("--years", type=int, nargs="+", required=True)
    parser.add_argument("--reuse-preserved", action="store_true")
    args = parser.parse_args()
    if not 0 < len(args.years) <= 3 or len(set(args.years)) != len(args.years):
        raise ValueError("Use one to three distinct year partitions")
    if args.state <= 0 or args.local_body <= 0 or any(y < 2020 or y > 2026 for y in args.years):
        raise ValueError("Invalid partition")
    base = ROOT / "data/acquisition/egramswaraj/api"
    base.mkdir(parents=True, exist_ok=True)
    summaries = []
    for year in args.years:
        partition = base / f"{args.state}-{year}-{args.local_body}"
        partition.mkdir(exist_ok=True)
        modules = {}
        sources = []
        failures = []
        for name, method in METHODS.items():
            checkpoint = partition / (name + ".source.json")
            url = f"https://egramswaraj.gov.in/webservice/{method}/{args.state}/{year}/{args.local_body}"
            try:
                if args.reuse_preserved and checkpoint.exists():
                    source = json.loads(checkpoint.read_text())
                    raw = (base / (source["sha256"] + ".json")).read_bytes()
                    if hashlib.sha256(raw).hexdigest() != source["sha256"]:
                        raise ValueError("Checksum mismatch")
                else:
                    with urlopen(
                        Request(url, headers={"User-Agent": "Hisaab source assessment"}), timeout=25
                    ) as response:
                        raw = response.read(20_000_001)
                    if len(raw) > 20_000_000:
                        raise ValueError("Response exceeds bounded size")
                    data = json.loads(raw)
                    index_records(data)
                    checksum = hashlib.sha256(raw).hexdigest()
                    original = base / (checksum + ".json")
                    if not original.exists():
                        original.write_bytes(raw)
                    source = dict(
                        url=url,
                        sha256=checksum,
                        retrievedAt=datetime.now(timezone.utc).isoformat(),
                        state=args.state,
                        localBody=args.local_body,
                        planYear=year,
                        accessBasis="Public GET service documented by NIC v3.0, December 2022; current successful response",
                        publicationBasis="Reuse authorization pending; private assessment only",
                    )
                    checkpoint.write_text(json.dumps(source, indent=2) + "\n")
                modules[name] = json.loads(raw)
                sources.append(source)
            except Exception as error:
                failures.append(dict(module=name, error=str(error)))
        assessment = assess(modules)
        assessment.update(
            sources=sources,
            failures=failures,
            completeAcquisition=not failures,
            coverage="Only returned records; service completeness not established",
        )
        (partition / "assessment.json").write_text(json.dumps(assessment, indent=2) + "\n")
        summaries.append(
            dict(
                year=year,
                counts=assessment["counts"],
                uniqueActivityIds=assessment["uniqueActivityIds"],
                failures=failures,
            )
        )
    print(json.dumps(summaries))


if __name__ == "__main__":
    main()
