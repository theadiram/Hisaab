#!/usr/bin/env python3
"""Hisaab's permission-gated acquisition, review and release audit CLI.

Public originals and local indexes only. No citizen cases or secrets in worker logs.
"""

import argparse, csv, hashlib, json, os, sys, tempfile, urllib.request
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
REGISTRY = DATA / "source-register.json"
ACQUISITION = DATA / "acquisition"


def read_json(path, default=None):
    if not Path(path).exists():
        return default
    return json.loads(Path(path).read_text())


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=path.parent, delete=False) as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
        tmp = file.name
    os.replace(tmp, path)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat()


def money(raw, unit="rupees"):
    text = str(raw).strip().removeprefix("₹").replace(",", "").strip()
    if not text:
        return None
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError(f"Unparseable amount: {raw!r}")
    if not value.is_finite():
        raise ValueError("Non-finite amount")
    scale = {"rupees": 1, "lakh": 100000, "crore": 10000000}[unit]
    scaled = value * scale
    if scaled != scaled.quantize(Decimal(".01")):
        raise ValueError("Amount has unsupported precision")
    return format(scaled, ".2f")


def source_record(source_id):
    for item in read_json(REGISTRY):
        if item["id"] == source_id:
            return item
    raise ValueError("Unknown source")


def fetch(args):
    route = source_record(args.source)
    if route["status"] not in ("api_verified", "export_verified"):
        raise ValueError(
            "Automated retrieval is disabled for this route. Establish access and permission, or register an authorized local export."
        )
    from urllib.parse import urlparse

    parsed = urlparse(args.url)
    allowed = urlparse(route["url"])
    if parsed.scheme != "https" or parsed.hostname != allowed.hostname:
        raise ValueError("Retrieval must use the verified source host over HTTPS")

    class SameOriginRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            if urlparse(newurl).hostname != allowed.hostname or urlparse(newurl).scheme != "https":
                raise ValueError("Cross-host redirect requires a separately verified route")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    opener = urllib.request.build_opener(SameOriginRedirect())
    request = urllib.request.Request(
        args.url,
        headers={"User-Agent": "Hisaab evidence retrieval / contact required before scheduling"},
    )
    with opener.open(request, timeout=30) as response:
        if response.status != 200:
            raise ValueError("Source did not return a successful document")
        body = response.read(100 * 1024 * 1024 + 1)
        if len(body) > 100 * 1024 * 1024:
            raise ValueError("Export exceeds 100 MB; split into permitted partitions")
    digest = hashlib.sha256(body).hexdigest()
    folder = DATA / "originals" / args.source
    folder.mkdir(parents=True, exist_ok=True)
    destination = folder / digest
    destination.write_bytes(body)
    register_document(args.source, destination, args.url, args.permission, args.partition)


def register_document(source, file, url, permission, partition):
    source_record(source)
    if not url.startswith("https://") or not permission.strip():
        raise ValueError("Official source URL and explicit permission basis required")
    original = Path(file)
    digest = sha(original)
    destination = DATA / "originals" / source / digest
    destination.parent.mkdir(parents=True, exist_ok=True)
    if original.resolve() != destination.resolve():
        destination.write_bytes(original.read_bytes())
    manifest = {
        "sourceId": source,
        "sha256": digest,
        "url": url,
        "permission": permission,
        "partition": partition,
        "retrievedAt": now(),
        "original": str(destination.relative_to(ROOT)),
        "state": "original_preserved",
    }
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", manifest)
    print(
        json.dumps(
            {"sha256": digest, "state": "original_preserved", "publication": "not_published"}
        )
    )


def extract_csv(args):
    mapping = read_json(args.mapping)
    document = read_json(ACQUISITION / "documents" / f"{args.hash}.json")
    if not mapping or not document:
        raise ValueError("A registered original and mapping file are required")
    source_record(document["sourceId"])
    original = ROOT / document["original"]
    if sha(original) != args.hash:
        raise ValueError("Original checksum mismatch")
    required = ["work_id", "title", "district", "state", "financial_year"]
    if any(k not in mapping["columns"] for k in required):
        raise ValueError("Mapping must establish work ID, title, geography and financial year")
    candidates = []
    quarantine = []
    with original.open(newline="", encoding=mapping.get("encoding", "utf-8-sig")) as file:
        rows = csv.DictReader(file)
        expected = set(mapping["columns"].values())
        if not expected.issubset(set(rows.fieldnames or [])):
            raise ValueError("Export schema differs from the reviewed mapping")
        for row_number, row in enumerate(rows, start=2):
            try:
                columns = mapping["columns"]
                get = lambda k: (row.get(columns.get(k, "")) or "").strip()
                identifier = get("work_id")
                if not identifier or not get("title"):
                    raise ValueError("Missing work identity")
                receipt_id = f"{args.hash[:12]}:{row_number}"
                receipt = {
                    "id": receipt_id,
                    "title": mapping["document_title"],
                    "url": document["url"],
                    "documentHash": args.hash,
                    "locator": f"CSV row {row_number}; source ID {identifier}",
                    "retrievedAt": document["retrievedAt"][:10],
                    "rawText": json.dumps(row, ensure_ascii=False),
                    "permission": document["permission"],
                }
                stages = []
                events = []
                for stage, measure, label in [
                    ("sanction", "sanction", "Sanction"),
                    ("award", "contract", "Award"),
                    ("payment", "payment", "Payment"),
                    ("completion", None, "Completion"),
                ]:
                    raw = get(measure or "completion_date")
                    amount = (
                        money(raw, mapping.get("amount_unit", "rupees"))
                        if measure and raw
                        else None
                    )
                    event_date = get(f"{measure}_date") if measure else get("completion_date")
                    if event_date:
                        date.fromisoformat(event_date)
                    found = amount is not None or (stage == "completion" and bool(event_date))
                    stages.append(
                        {
                            "id": stage,
                            "label": label,
                            "state": "pending" if found else "inaccessible",
                            "date": event_date or None,
                            "amount": amount,
                            "description": "Extracted candidate awaiting source and match review."
                            if found
                            else "This export does not establish this stage. No claim that the record does not exist.",
                            "receipts": [receipt] if found else [],
                        }
                    )
                    if measure and amount is not None and event_date:
                        event_id = get("payment_id") if measure == "payment" else identifier
                        if measure == "payment" and not event_id:
                            raise ValueError(
                                "Payment identity required; cannot invent a transaction ID"
                            )
                        kind = (
                            mapping.get("payment_kind", "transaction")
                            if measure == "payment"
                            else "transaction"
                        )
                        events.append(
                            {
                                "id": f"{receipt_id}:{measure}",
                                "measure": measure,
                                "amount": amount,
                                "kind": kind,
                                "canonicalId": f"{document['sourceId']}:{measure}:{event_id}",
                                "date": event_date,
                                "receiptId": receipt_id,
                                "originalAmount": raw,
                                "originalUnit": mapping.get("amount_unit", "rupees"),
                                "approved": False,
                            }
                        )
                candidates.append(
                    {
                        "id": hashlib.sha256(
                            f"{document['sourceId']}:{identifier}".encode()
                        ).hexdigest()[:24],
                        "title": get("title"),
                        "purpose": mapping.get("purpose", "Unclassified"),
                        "state": get("state"),
                        "district": get("district"),
                        "areaId": get("area_id") or "",
                        "financialYear": get("financial_year"),
                        "officialIds": [identifier],
                        "location": None,
                        "locationPrecision": "district",
                        "authority": get("authority") or None,
                        "authorityReceipt": receipt if get("authority") else None,
                        "physicalVerification": "Not independently verified",
                        "summary": "Unpublished source extraction; review required.",
                        "stages": stages,
                        "money": events,
                        "review": {
                            "state": "pending",
                            "documentHash": args.hash,
                            "row": row_number,
                            "mappingVersion": mapping["version"],
                        },
                    }
                )
            except (ValueError, KeyError, InvalidOperation) as error:
                quarantine.append({"row": row_number, "reason": str(error)})
    # A generic row parser cannot know whether repeated work IDs represent
    # separate bills, revisions or cumulative snapshots. Preserve the original
    # rows for a source-specific merge review rather than publishing one row.
    grouped = {}
    for candidate in candidates:
        grouped.setdefault(candidate["id"], []).append(candidate)
    safe = []
    for work_id, records in grouped.items():
        if len(records) == 1:
            safe.append(records[0])
            continue
        for record in records:
            quarantine.append(
                {
                    "row": record["review"]["row"],
                    "workId": work_id,
                    "reason": "Repeated work identity requires a reviewed multi-row merge; no rows from this work are eligible for publication.",
                }
            )
    candidates = safe
    result = {
        "sourceId": document["sourceId"],
        "documentHash": args.hash,
        "candidates": candidates,
        "quarantine": quarantine,
        "extractedAt": now(),
    }
    atomic_json(ACQUISITION / "candidates" / f"{args.hash}.json", result)
    print(
        json.dumps(
            {
                "candidates": len(candidates),
                "quarantined": len(quarantine),
                "publication": "review_required",
            }
        )
    )


def import_lgd(args):
    document = read_json(ACQUISITION / "documents" / f"{args.hash}.json")
    mapping = read_json(args.mapping)
    if not document or document["sourceId"] != "lgd":
        raise ValueError("Register an official LGD original first")
    original = ROOT / document["original"]
    if sha(original) != args.hash:
        raise ValueError("Checksum mismatch")
    with original.open(newline="", encoding="utf-8-sig") as file:
        areas = []
        for row in csv.DictReader(file):
            code = row[mapping["code"]].strip()
            name = row[mapping["name"]].strip()
            if not code or not name:
                raise ValueError("Incomplete LGD identity")
            areas.append(
                {
                    "id": f"district:{code}",
                    "code": code,
                    "name": name,
                    "kind": "district",
                    "state": row[mapping["state"]].strip(),
                    "sourceHash": args.hash,
                }
            )
    if len({x["id"] for x in areas}) != len(areas):
        raise ValueError("Duplicate district codes in the supplied current registry")
    atomic_json(
        ACQUISITION / "districts.json",
        {"areas": areas, "sourceHash": args.hash, "importedAt": now()},
    )
    print(json.dumps({"districts": len(areas), "boundaryGeometry": "not_imported"}))


def audit():
    routes = read_json(REGISTRY)
    works = read_json(DATA / "published.json", {"works": []})["works"]
    districts = read_json(ACQUISITION / "districts.json", {"areas": []})["areas"]
    covered = {w["areaId"] for w in works if not w.get("demo")}
    gaps = [d for d in districts if d["id"] not in covered]
    result = {
        "generatedAt": now(),
        "publicReleaseReady": False,
        "works": len(works),
        "districtsExpected": len(districts) or None,
        "districtsCovered": len(covered),
        "emptyDistricts": gaps,
        "sourceRoutes": routes,
        "releaseBlockers": [],
    }
    blockers = result["releaseBlockers"]
    if not districts:
        blockers.append("Current official LGD district registry not imported")
    if gaps:
        blockers.append(f"{len(gaps)} districts lack verified works")
    if not works:
        blockers.append("No verified government works published")
    if any(r["status"] not in ("backfill_complete", "unavailable_documented") for r in routes):
        blockers.append("Ten-year source inventory/backfill incomplete")
    blockers.extend(
        [
            "Evidence audit not signed off",
            "Private uploads and production case storage not audited",
            "Authority routing not verified",
            "AI evaluation not completed",
            "Production deployment and restore test not completed",
        ]
    )
    atomic_json(ACQUISITION / "release-audit.json", result)
    print(json.dumps(result, indent=2))
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("audit")
    commands.add_parser("release-check")
    p = commands.add_parser("register")
    p.add_argument("--source", required=True)
    p.add_argument("--file", required=True)
    p.add_argument("--url", required=True)
    p.add_argument("--permission", required=True)
    p.add_argument("--partition", required=True)
    p = commands.add_parser("fetch")
    p.add_argument("--source", required=True)
    p.add_argument("--url", required=True)
    p.add_argument("--permission", required=True)
    p.add_argument("--partition", required=True)
    p = commands.add_parser("extract-csv")
    p.add_argument("--hash", required=True)
    p.add_argument("--mapping", required=True)
    p = commands.add_parser("import-lgd")
    p.add_argument("--hash", required=True)
    p.add_argument("--mapping", required=True)
    args = parser.parse_args()
    if args.command in ("audit", "release-check"):
        result = audit()
        if args.command == "release-check" and result["releaseBlockers"]:
            sys.exit(2)
    elif args.command == "register":
        register_document(args.source, args.file, args.url, args.permission, args.partition)
    elif args.command == "fetch":
        fetch(args)
    elif args.command == "extract-csv":
        extract_csv(args)
    elif args.command == "import-lgd":
        import_lgd(args)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as error:
        print(json.dumps({"error": str(error), "publication": "unchanged"}), file=sys.stderr)
        sys.exit(1)
