"""Preserve public bank-processing rows without assigning payments to projects.
No account identifiers or unnecessary banking instruction/credit identifiers are
included in the normalized records. The original stays in private storage.
"""

import csv, io, json, hashlib, argparse
from pathlib import Path
from decimal import Decimal
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
URL = "https://pmgsy.dord.gov.in/PFMSReports/PFMSReports/DisplayMISPayment?id=01-04-2019$07-10-2026"
REQUIRED = {
    "admin_nd_name",
    "SRRDA",
    "BILL_NO",
    "BILL_DATE",
    "CHQ_NO",
    "CHQ_AMOUNT",
    "PAYMENT_REQ_FILENAME",
    "Bank_Ack_Status",
    "BANK_ACK_TXNDATE",
}


def date(raw):
    raw = raw.strip()
    return (
        None
        if raw in ("", "-", "NA", "N/A")
        else datetime.strptime(raw, "%d/%m/%Y").date().isoformat()
    )


def extract(raw):
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    if not REQUIRED.issubset(reader.fieldnames or []):
        raise ValueError("Declared payment-report schema changed")
    records = []
    by_id = {}
    conflicts = set()
    duplicates = 0
    quarantine = []
    for row in reader:
        if not row.get("CHQ_NO"):
            continue  # footer / aggregate rows are not payments
        try:
            amount = Decimal(row["CHQ_AMOUNT"].replace(",", ""))
            billdate = date(row["BILL_DATE"])
            bankdate = date(row["BANK_ACK_TXNDATE"])
            if not amount.is_finite() or amount < 0 or amount != amount.quantize(Decimal(".01")):
                raise ValueError("Invalid rupee amount")
            if not billdate:
                raise ValueError("Missing bill date")
            source_identity = "|".join(
                [row["SRRDA"].strip(), row["admin_nd_name"].strip(), row["CHQ_NO"].strip()]
            )
            id = hashlib.sha256(source_identity.encode()).hexdigest()[:24]
            record = {
                "id": id,
                "institution": row["SRRDA"].strip(),
                "implementingUnit": row["admin_nd_name"].strip(),
                "billNumber": row["BILL_NO"],
                "billDate": billdate,
                "paymentReference": row["CHQ_NO"],
                "chequeAmount": format(amount, ".2f"),
                "currency": "INR",
                "amountBasis": "Source cheque amount; net/gross and allocation semantics not established",
                "paymentFile": row["PAYMENT_REQ_FILENAME"],
                "pfmsStatus": row.get("Pfms_status"),
                "bankStatus": row["Bank_Ack_Status"],
                "bankReportedTransactionDate": bankdate,
                "projectId": None,
                "payee": None,
                "scope": "Institution payment record; development-project allocation absent",
                "approved": False,
            }
            if id in by_id:
                if by_id[id] != record:
                    conflicts.add(id)
                    raise ValueError("Conflicting source payment identity; all versions excluded")
                duplicates += 1
                continue
            by_id[id] = record
            records.append(record)
        except Exception as e:
            quarantine.append({"line": reader.line_num, "reason": str(e)})
    return [r for r in records if r["id"] not in conflicts], duplicates, quarantine


def run(filename):
    raw = Path(filename).read_bytes()
    records, duplicates, quarantine = extract(raw)
    h = hashlib.sha256(raw).hexdigest()
    stamp = datetime.now(timezone.utc).isoformat()
    source = "ommas-pfms-bank-report"
    original = ROOT / "data/originals" / source / h
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(raw)
    manifest = {
        "sourceId": source,
        "sourceName": "OMMAS public PFMS bank-processing report",
        "sourceFamily": "National schemes",
        "sha256": h,
        "url": URL,
        "contextUrl": "https://pmgsy.dord.gov.in/",
        "retrievedAt": stamp,
        "original": str(original.relative_to(ROOT)),
        "contentType": "text/csv",
        "parserVersion": "ommas-pfms-payment-csv-v1",
        "permissionStatus": "policy_identified_pending_mfa_review",
        "permission": "Accurate attributed OMMAS text/data reuse; no endorsement",
        "policyUrl": "https://pmgsy.dord.gov.in/Home/HomeCopyrightPolicy/",
        "locator": "PFMS MIS Payment report; 01/04/2019–07/10/2026; Odisha / Rural Works Organisation / Bank Accepted drilldown",
        "unitsEvidence": "Rendered report column: Cheque Amount (In Rs.)",
        "limitations": [
            "Bill-to-road allocations, contractor/payee identity and net/gross semantics absent.",
            "Institution payments may include other expenditure; none assigned to development projects.",
            "Bank status is source-reported, not an independent bank confirmation.",
        ],
    }
    (ROOT / "data/acquisition/documents" / f"{h}.json").write_text(
        json.dumps(manifest, indent=2) + "\n"
    )
    folder = ROOT / "data/acquisition/ommas-financial"
    (folder / "bank-payment-records.jsonl").write_text(
        "".join(json.dumps(r) + "\n" for r in records)
    )
    (folder / "bank-payment-quarantine.json").write_text(json.dumps(quarantine, indent=2) + "\n")
    summary = {
        "checkedAt": stamp,
        "sourceUrl": URL,
        "documentHash": h,
        "recordsPreserved": len(records),
        "duplicatesExcluded": duplicates,
        "quarantined": len(quarantine),
        "reportedBankAccepted": sum(r["bankStatus"] == "Accepted" for r in records),
        "withBankReportedTransactionDate": sum(
            bool(r["bankReportedTransactionDate"]) for r in records
        ),
        "projectAllocations": 0,
        "published": 0,
        "scope": "Odisha Rural Works Organisation; source report range 2019–2026, not nationwide payment coverage",
        "limitations": manifest["limitations"],
    }
    (ROOT / "data/bank-payment-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("csv")
    run(p.parse_args().csv)
