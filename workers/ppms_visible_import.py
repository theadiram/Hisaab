"""Import minimized, manually observed bill dialogs into private review only.

This does not fetch a browser endpoint or establish settlement. Observe each
dialog after its asynchronous update before preparing the input manifest.
"""

import argparse
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
GAP = "PDF component amounts clipped; visible bill dialog needed"
FIELDS = {"serial", "sourceName", "component", "amount", "sourcePaymentStatus"}
CAPTURE_FIELDS = {
    "projectCode",
    "billSerial",
    "reportAmount",
    "sourceUrl",
    "capturedAt",
    "captureBasis",
    "records",
    "sourceSnapshot",
    "approved",
    "settlementVerified",
}


def identity(row):
    return row["projectCode"], row["billSerial"]


def fingerprint(row):
    return json.dumps(row["records"], sort_keys=True, separators=(",", ":"))


def validate_capture(row, base, catalogue, existing):
    if set(row) - CAPTURE_FIELDS:
        raise ValueError("Unexpected capture metadata; use minimized observation fields only")
    key = identity(row)
    allowed = [r for r in catalogue["records"] if (r["Project Code"], r["Bill Serial No"]) == key]
    if not allowed or any(tuple(c["identity"][:2]) == key for c in catalogue.get("conflicts", [])):
        raise ValueError("Missing or conflicted exact project/bill association")
    if not any(
        Decimal(r["Total Expenditure Amount"]) == Decimal(row["reportAmount"])
        and r["Status"] != "Failed"
        for r in allowed
    ):
        raise ValueError("Amount or Failed status differs from archived bill")
    url = urlparse(row["sourceUrl"])
    if (
        url.scheme != "https"
        or url.netloc != "ppms.odisha.gov.in"
        or url.path != "/report/ifms-transaction"
    ):
        raise ValueError("Unexpected visible report source")
    snapshot = row["sourceSnapshot"]
    if Path(snapshot["file"]).name != snapshot["file"]:
        raise ValueError("Snapshot path must stay inside private evidence folder")
    raw = (base / snapshot["file"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != snapshot["sha256"]:
        raise ValueError("Snapshot checksum mismatch")
    preserved = json.loads(raw)
    for field in (
        "projectCode",
        "billSerial",
        "reportAmount",
        "sourceUrl",
        "records",
        "capturedAt",
    ):
        if preserved[field] != row[field]:
            raise ValueError("Manifest differs from preserved observation")
    if not row["records"] or len({r["serial"] for r in row["records"]}) != len(row["records"]):
        raise ValueError("Empty or duplicate component rows")
    for component in row["records"]:
        if set(component) != FIELDS:
            raise ValueError("Unexpected component fields; banking fields prohibited")
        value = Decimal(component["amount"].replace(",", ""))
        if not value.is_finite() or value < 0:
            raise ValueError("Invalid source component amount")
    if any(identity(old) != key and fingerprint(old) == fingerprint(row) for old in existing):
        raise ValueError(
            "Identical components on different bills: inspect possible stale dialog before import"
        )
    result = dict(row)
    result["beneficiarySum"] = format(
        sum((Decimal(r["amount"].replace(",", "")) for r in row["records"]), Decimal(0)), ".2f"
    )
    result.update(
        matchesReportAmount=Decimal(result["beneficiarySum"]) == Decimal(row["reportAmount"]),
        approved=False,
        settlementVerified=False,
        sourceLocator="Exact project and bill row → expenditure amount → separately observed Transaction Details",
        interpretation="Source-reported components only. Units, transaction dates, allocation definitions, final-recipient roles, settlement and reuse remain unverified.",
    )
    return result


def save_revision(path, value):
    if path.exists():
        previous = path.read_bytes()
        revision = path.with_name(hashlib.sha256(previous).hexdigest() + "." + path.name)
        if not revision.exists():
            revision.write_bytes(previous)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    args = parser.parse_args()
    base = ROOT / "data/acquisition/ppms/payment-details"
    path = base / "additional-visible-bill-details.json"
    data = json.loads(path.read_text())
    catalogue = json.loads(
        (ROOT / "data/acquisition/ppms/state-assessment/state-batch-assessment.json").read_text()
    )
    incoming = json.loads(args.manifest.read_text())["records"]
    records = list(data["records"])
    for row in incoming:
        checked = validate_capture(row, base, catalogue, records)
        prior = next((r for r in records if identity(r) == identity(checked)), None)
        if prior:
            if prior["sourceSnapshot"] != checked["sourceSnapshot"]:
                raise ValueError(
                    "Existing bill has a different observation; explicit revision review required"
                )
            continue
        records.append(checked)
    data["records"] = records
    save_revision(path, data)
    gap_path = ROOT / "data/acquisition/ppms/projects/pilot-gap-register.json"
    gaps = json.loads(gap_path.read_text())
    assessment = json.loads(
        (ROOT / "data/acquisition/ppms/state-payment-details/assessment.json").read_text()
    )
    covered = {identity(r) for r in records}
    for case in gaps["cases"]:
        clipped = {
            identity(r)
            for r in assessment["records"]
            if r["projectCode"] == case["projectCode"]
            and r.get("beneficiaryBreakdown", {}).get("layoutClipped")
        }
        if clipped and clipped <= covered:
            case["specificGaps"] = [g for g in case["specificGaps"] if g != GAP]
        elif clipped and GAP not in case["specificGaps"]:
            case["specificGaps"].append(GAP)
    gaps["specificGapCounts"] = dict(Counter(g for c in gaps["cases"] for g in c["specificGaps"]))
    save_revision(gap_path, gaps)
    print(
        json.dumps(
            dict(
                privateDialogs=len(records),
                remainingClippedProjects=gaps["specificGapCounts"].get(GAP, 0),
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
