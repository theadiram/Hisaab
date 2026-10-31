"""Audit preserved PPMS bill evidence without approving payments or settlement."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def audit(base, assessment, catalogue):
    allowed = {
        (row["Project Code"], row["Bill Serial No"], url)
        for row in catalogue["records"]
        for url in row["sourceLinks"]
    }
    conflicts = {tuple(c["identity"][:2]) for c in catalogue.get("conflicts", [])}
    seen = set()
    records = assessment["records"]
    failures = assessment.get("failures", [])
    preserved = 0
    for record, parsed in [(r, True) for r in records] + [(r, False) for r in failures]:
        url = record["sourceUrl"]
        if url in seen:
            raise ValueError("Duplicate source download URL")
        seen.add(url)
        identity = (record["projectCode"], record["billSerial"], url)
        if identity not in allowed:
            raise ValueError("Document is not associated with an exact observed bill")
        if parsed and (
            record.get("approved") is not False or record.get("settlementVerified") is not False
        ):
            raise ValueError("Acquisition evidence contains an unsupported approval")
        if parsed and record.get("reportConflict") != (identity[:2] in conflicts):
            raise ValueError("Report conflict quarantine is inconsistent")
        source = record.get("source")
        if not source:
            if parsed:
                raise ValueError("Parsed record lacks a preserved original")
            continue
        filename = source["file"]
        if Path(filename).name != filename:
            raise ValueError("Original filename must remain within the evidence directory")
        raw = (base / filename).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError("Original document checksum mismatch")
        if not raw.lstrip().startswith(b"%PDF"):
            raise ValueError("Preserved original is not a PDF")
        preserved += 1
    return dict(
        checkedAt=datetime.now(timezone.utc).isoformat(),
        documents=len(records),
        preservedOriginals=preserved,
        failedAttempts=len(failures),
        allOriginalChecksumsPassed=True,
        exactBillAssociationsPassed=True,
        uniqueDownloadUrls=True,
        conflictQuarantinePassed=True,
        approvedPayments=0,
    )


def main():
    base = ROOT / "data/acquisition/ppms/state-payment-details"
    assessment = json.loads((base / "assessment.json").read_text())
    catalogue = json.loads(
        (ROOT / "data/acquisition/ppms/state-assessment/state-batch-assessment.json").read_text()
    )
    result = audit(base, assessment, catalogue)
    # Write a success receipt only after every original passes. Exceptions must
    # propagate so automation cannot mistake a partial audit for success.
    (base / "integrity-audit-current.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
