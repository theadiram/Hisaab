"""Read-only provenance and publication-path assessment; never approves records."""

import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run():
    manifest = json.loads((ROOT / "data/acquisition/geography/manifest.json").read_text())
    originals = []
    for source in manifest["files"]:
        path = ROOT / source["original"]
        exists = path.exists()
        digest = hashlib.sha256(path.read_bytes()).hexdigest() if exists else None
        originals.append(
            {
                "path": source["original"],
                "expectedHash": source["sha256"],
                "checksumMatches": digest == source["sha256"],
                "sizeMatches": exists and path.stat().st_size == source["bytes"],
            }
        )
    with sqlite3.connect(
        f"file:{ROOT / 'data/acquisition/geography/assets.sqlite'}?mode=ro", uri=True
    ) as db:
        sources = db.execute("select hash,metadata from sources").fetchall()
        metadata_matches = all(
            json.loads(meta) == next(s for s in manifest["files"] if s["sha256"] == sha)
            for sha, meta in sources
        )
        total = db.execute("select count(*) from assets").fetchone()[0]
        linked = db.execute(
            "select count(*) from assets a join sources s on s.hash=a.source_hash"
        ).fetchone()[0]
        invalid = db.execute(
            "select count(*) from assets where lng not between -180 and 180 or lat not between -90 and 90"
        ).fetchone()[0]
        text_flags = db.execute("select count(*) from assets where text_review<>0").fetchone()[0]
        used_sources = db.execute("select count(distinct source_hash) from assets").fetchone()[0]
    nhidcl = json.loads(
        (
            ROOT / "data/acquisition/state-development/nhidcl-review/card-review-packets.json"
        ).read_text()
    )
    result = {
        "auditedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "Local provenance checks and source-evidence publication route assessment; not approval or live hosted inspection.",
        "historicalArchive": {
            "edition": manifest["edition"],
            "originalFiles": len(originals),
            "originalBytes": sum(s["bytes"] for s in manifest["files"]),
            "matchingChecksums": sum(s["checksumMatches"] for s in originals),
            "matchingSizes": sum(s["sizeMatches"] for s in originals),
            "sqliteSourceMetadataMatchesManifest": metadata_matches,
            "sqliteSourceRecords": len(sources),
            "sourceArchivesUsedByAcceptedAssets": used_sources,
            "assetRecords": total,
            "assetRecordsWithPreservedSourceReference": linked,
            "invalidGlobalCoordinates": invalid,
            "textEncodingReviewFlags": text_flags,
            "meaning": "Traceable historical source coordinates; not verified physical sites, current asset census, projects or spending.",
        },
        "officialPolicyReferences": [
            {
                "url": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1800373",
                "checkedVia": "web tool on 2026-10-25",
                "finding": "Official release describes public GIS data, DataMeet collaboration and Government of India Open Data License.",
            },
            {
                "url": "https://www.nhidcl.com/en/website-policies",
                "checkedVia": "web tool on 2026-10-25",
                "finding": "Accurate attributed reproduction allowed; designated third-party material excluded. Document-specific review still required.",
            },
        ],
        "existingPublicationRules": {
            "allFourStagesRepresented": True,
            "allFourStagesFoundRequired": False,
            "missingPaymentAllowed": True,
            "pendingCompletionAllowed": True,
            "completionBasisRequiredWhenFound": True,
            "individualPaymentAllocationRequiredWhenApproved": True,
            "rightsAndPreservedOriginalsRequired": True,
            "ownerMfaRequired": True,
            "exactLocationNeededForMapDot": True,
            "warning": "Passing local schema/evidence validation does not establish source rights, reconciled identity or approval.",
        },
        "reviewQueues": {
            "historicalLocationsWithVerifiedArchiveReferences": linked,
            "nhidclSourceComparisonPackets": len(nhidcl["records"]),
            "nhidclContractFactsFirst": sum(
                r["reviewPriority"] == "contract_facts_first" for r in nhidcl["records"]
            ),
            "nhidclPacketsWithReviewedExactLocation": sum(
                r["locationEvidenceVerified"] for r in nhidcl["records"]
            ),
            "nhidclPacketsWithVerifiedPaymentEvidence": sum(
                r["paymentEvidenceVerified"] for r in nhidcl["records"]
            ),
            "publicationApprovedByThisAudit": 0,
            "warning": "Review queues are not publication-ready counts and overlap other holdings.",
        },
        "originalChecks": originals,
    }
    folder = ROOT / "data/acquisition/first-dots"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "publication-path-audit-2026-10-25.json").write_text(
        json.dumps(result, indent=2) + "\n"
    )
    print(json.dumps({k: result[k] for k in ["historicalArchive", "reviewQueues"]}, indent=2))


if __name__ == "__main__":
    run()
