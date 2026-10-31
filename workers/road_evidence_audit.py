"""Recheck all proposed road links against preserved originals; never approve publication."""

import collections, hashlib, json, math, sqlite3
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]


def audit_link(link, candidate, assets):
    raw = candidate["review"]["raw"]
    errors = []
    for asset in assets:
        fields = json.loads(asset["source_fields"])
        observed = (
            asset["state_id"],
            asset["district_id"],
            asset["source_identity"],
            fields.get("IMS_YEAR"),
            fields.get("IMS_BATCH"),
            asset["title"].strip().casefold(),
        )
        expected = (
            raw.get("MAST_STATE_CODE"),
            raw.get("MAST_DISTRICT_CODE"),
            str(raw.get("IMS_PR_ROAD_CODE")),
            raw.get("IMS_YEAR"),
            raw.get("IMS_BATCH"),
            raw.get("IMS_ROAD_NAME", "").strip().casefold(),
        )
        if observed != expected:
            errors.append("Cross-source identity mismatch")
        if asset["source_hash"] != link["geographyDocumentHash"]:
            errors.append("Geography source hash mismatch")
        geometry = json.loads(asset["geometry"])
        parts = (
            geometry["coordinates"]
            if geometry["type"] == "MultiLineString"
            else [geometry["coordinates"]]
        )
        if geometry["type"] not in ("LineString", "MultiLineString") or any(
            len(part) < 2
            or any(
                not math.isfinite(x)
                or not math.isfinite(y)
                or not 68 <= x <= 98
                or not 5 <= y <= 38
                for x, y, *_ in part
            )
            for part in parts
        ):
            errors.append("Invalid source geometry")
    if len(assets) != len(link["geographyAssetIds"]):
        errors.append("Missing source features")
    if (
        candidate["id"] != link["candidateId"]
        or candidate["review"]["documentHash"] != link["workDocumentHash"]
    ):
        errors.append("Candidate lineage mismatch")
    stages = {s["id"]: s for s in candidate["stages"]}
    payment = any(
        s["id"] == "payment" and s["state"] == "found" and s["receipts"]
        for s in candidate["stages"]
    ) and any(
        e["measure"] == "payment" and e["approved"] and e["kind"] == "transaction"
        for e in candidate["money"]
    )
    return {
        "candidateId": candidate["id"],
        "officialRoadId": str(raw["IMS_PR_ROAD_CODE"]),
        "workDocumentHash": link["workDocumentHash"],
        "geographyDocumentHash": link["geographyDocumentHash"],
        "sourceFeatures": len(assets),
        "identityChecks": "passed" if not errors else "failed",
        "errors": sorted(set(errors)),
        "sanctionDatePresent": bool(stages["sanction"]["date"]),
        "agreementDatePresent": bool(stages["award"]["date"]),
        "agreementIdentifierPresent": bool(raw.get("TEND_AGREEMENT_NUMBER")),
        "sourceSanctionValuePresent": raw.get("TOTAL_SANCTIONED_COST") is not None,
        "sourceAgreementValuePresent": raw.get("TEND_AGREEMENT_AMOUNT") is not None,
        "financialUnitVerified": False,
        "individualPaymentEvidence": payment,
        "completionCertificate": False,
        "publicationApproved": False,
        "blockers": [
            "Original financial unit and project-specific financial evidence",
            "Current location/scope and source-edition review",
            "Payment ledger or dated voucher",
            "Completion evidence",
            "MFA publication review",
        ],
    }


def run():
    db = sqlite3.connect(ROOT / "data/acquisition/geography/assets.sqlite")
    db.row_factory = sqlite3.Row
    candidates = {}
    verified = set()
    for p in sorted((ROOT / "data/acquisition/candidates").glob("*.json")):
        data = json.loads(p.read_text())
        for c in data.get("candidates", []):
            candidates[c["id"]] = c
    links = [
        json.loads(l)
        for l in (ROOT / "data/acquisition/geography/road-matches.jsonl").read_text().splitlines()
    ]
    sources = {r["hash"]: json.loads(r["metadata"]) for r in db.execute("select * from sources")}
    counts = collections.Counter()
    rows = []
    for link in links:
        c = candidates[link["candidateId"]]
        for digest, original in [
            (
                link["workDocumentHash"],
                ROOT / "data/originals/pmgsy-dashboard" / link["workDocumentHash"],
            ),
            (
                link["geographyDocumentHash"],
                ROOT / sources[link["geographyDocumentHash"]]["original"],
            ),
        ]:
            if digest not in verified:
                if hashlib.sha256(original.read_bytes()).hexdigest() != digest:
                    raise ValueError("Preserved original checksum mismatch")
                verified.add(digest)
        assets = [
            db.execute("select * from assets where id=?", (id,)).fetchone()
            for id in link["geographyAssetIds"]
        ]
        assets = [a for a in assets if a is not None]
        row = audit_link(link, c, assets)
        rows.append(row)
        counts["projectsAudited"] += 1
        counts["identityChecksPassed" if not row["errors"] else "identityChecksFailed"] += 1
        for name in [
            "sanctionDatePresent",
            "agreementDatePresent",
            "agreementIdentifierPresent",
            "sourceSanctionValuePresent",
            "sourceAgreementValuePresent",
            "financialUnitVerified",
            "individualPaymentEvidence",
            "completionCertificate",
        ]:
            counts[name] += int(row[name])
    folder = ROOT / "data/acquisition/geography"
    (folder / "road-evidence-audit.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "counts": dict(counts),
        "originalDocumentsChecksumVerified": len(verified),
        "method": "All six identity attributes, every referenced feature, original SHA-256 and available stage fields rechecked. This is automated lineage review, not publication or independent field verification.",
        "published": 0,
        "next": "Resolve amount units with project-specific official reports; acquire dated payment records and completion evidence; review geometry and publish through MFA.",
    }
    (ROOT / "data/road-evidence-audit.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    run()
