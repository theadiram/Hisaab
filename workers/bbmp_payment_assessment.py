"""Assess a preserved BBMP mirror without treating net bill values as payments.

Output is private review material. Source row IDs are provisional bill identities;
RTGS references are events, not proof of settlement or independently allocated sums.
"""

import csv
import hashlib
import html
import json
import re
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACQUISITION = ROOT / "data/acquisition/report-review-2026-10-07"


def clean(value):
    return html.unescape(re.sub(r"<[^>]*>", "", value)).strip()


def reference(value, label):
    match = re.search(r"\b" + label + r"\s*-\s*(\d+)\s*/\s*(\d{2}-[A-Za-z]{3}-\d{4})", value, re.I)
    if not match:
        return None
    return {
        "reference": match[1],
        "date": datetime.strptime(match[2], "%d-%b-%Y").date().isoformat(),
    }


def amount(value):
    try:
        result = Decimal(value.replace(",", "").strip())
        if not result.is_finite() or result < 0:
            return None
        return format(result, "f")
    except InvalidOperation:
        return None


def assess(rows):
    bills = {}
    events = []
    seen = set()
    exact_duplicates = 0
    arithmetic = 0
    unknown_jobs = 0
    for row in rows:
        job = re.match(r"^(\d{3}-\d{2}-\d{6})(?!\d)", clean(row["wodetails"]))
        job_code = job[1] if job else None
        unknown_jobs += job_code is None
        values = {
            key: amount(row[column])
            for key, column in [("gross", "amount"), ("net", "nett"), ("deductions", "deduction")]
        }
        valid = all(v is not None for v in values.values())
        agrees = valid and Decimal(values["gross"]) - Decimal(values["deductions"]) == Decimal(
            values["net"]
        )
        arithmetic += bool(agrees)
        # Preserve conflicting editions. Identity requires review before ingestion.
        key = (row["id"], job_code)
        bill = bills.setdefault(
            key,
            {
                "sourceRowId": row["id"],
                "jobCode": job_code,
                "ward": row["ward"],
                "wardRegime": "198",
                "title": clean(row["wodetails"]),
                "billReference": reference(row["brnumber"], "BR"),
                "editions": [],
                "reviewStatus": "pending",
                "approved": False,
            },
        )
        edition = dict(
            values, arithmeticMatches=bool(agrees), amountUnit="unconfirmed source units"
        )
        if edition not in bill["editions"]:
            bill["editions"].append(edition)
        signature = tuple(row[k] for k in sorted(row) if k != "slno")
        if signature in seen:
            exact_duplicates += 1
            continue
        seen.add(signature)
        events.append(
            {
                "sourceRowId": row["id"],
                "jobCode": job_code,
                "rtgs": reference(row["brnumber"], "Rtgs"),
                "transactionAmount": None,
                "amountBasis": "unknown; CSV nett is a bill value",
                "settlementVerified": False,
                "approved": False,
            }
        )
        # Contractor strings embed phone numbers; do not propagate them. Original
        # stays private. A recipient business role requires separate verification.
    for bill in bills.values():
        bill["conflict"] = len(bill["editions"]) > 1
    counts = Counter(row["id"] for row in rows)
    return {
        "bills": list(bills.values()),
        "paymentEventReferences": events,
        "summary": {
            "rows": len(rows),
            "recognizedJobCodes": len({b["jobCode"] for b in bills.values() if b["jobCode"]}),
            "unrecognizedJobRows": unknown_jobs,
            "amountArithmeticMatches": arithmetic,
            "repeatedBillIds": sum(n > 1 for n in counts.values()),
            "exactDuplicateRows": exact_duplicates,
            "provisionalBills": len(bills),
            "conflictingBills": sum(b["conflict"] for b in bills.values()),
            "paymentAmountsVerified": 0,
            "approvedPayments": 0,
        },
    }


def main():
    manifest = json.loads((ACQUISITION / "bbmp-csv.json").read_text())
    source = ACQUISITION / manifest["file"]
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
        raise ValueError("Preserved original checksum mismatch")
    with source.open(encoding="utf-8-sig", newline="") as handle:
        result = assess(list(csv.DictReader(handle)))
    result["source"] = manifest
    result["limitations"] = [
        "No net bill sum is a payment total.",
        "Repeated RTGS events may be instalments, reissues or attempts; amounts need official event-level evidence.",
        "No recipient, exact geography, settlement or publication approval inferred.",
    ]
    (ACQUISITION / "bbmp-normalized-review.json").write_text(
        json.dumps(result, indent=2, ensure_ascii=False) + "\n"
    )
    public = json.loads((ROOT / "data/bbmp-payment-source-assessment.json").read_text())
    public.update(result["summary"])
    public.update(primaryBillsCompared=2, partialPaidMismatchObserved=True)
    (ROOT / "data/bbmp-payment-source-assessment.json").write_text(
        json.dumps(public, indent=2) + "\n"
    )
    print(json.dumps(result["summary"]))


if __name__ == "__main__":
    main()
