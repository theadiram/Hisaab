"""Normalize a preserved public MPLADS expenditure response for private review.

No transaction identity is invented from row numbers, work names or amounts.
Repeated rows are retained until payment references/reversals are available.
"""

import hashlib
import json
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "data/acquisition/mplads/public-script-review"


def assess(raw):
    # Preserve undecodable bytes without silently changing names. Review output
    # uses escaped JSON; encoding faults remain flagged and never published.
    outer = json.loads(raw.decode("utf-8", errors="surrogateescape"))
    rows = json.loads(outer["Total Expenditure"], parse_float=Decimal)
    records = [row for row in rows if "WORK_ID" in row]
    normalized = []
    for row in records:
        encoding_issue = any(
            any(0xDC80 <= ord(c) <= 0xDCFF for c in v) for v in row.values() if isinstance(v, str)
        )
        try:
            date = datetime.strptime(row["EXPENDITURE_DATE"], "%d-%b-%Y").date().isoformat()
        except (ValueError, TypeError):
            date = None
        try:
            value = Decimal(str(row["FUND_DISBURSED_AMT"]))
            value = format(value, "f") if value.is_finite() and value >= 0 else None
        except Exception:
            value = None
        normalized.append(
            {
                "sourceRowNumber": row.get("Sno"),
                "workId": row["WORK_ID"],
                "recommendationId": row.get("WORK_RECOMMENDATION_DTL_ID"),
                "house": row.get("HOUSE_OF_PARLIAMENT"),
                "state": row.get("STATE_NAME"),
                "title": row.get("ACTIVITY_NAME"),
                "implementingAgency": row.get("IA_NAME"),
                "vendorSourceId": row.get("VENDOR_ID"),
                "vendorLabel": row.get("VENDOR_NAME"),
                "expenditureDate": date,
                "sourceReportedDisbursedRupees": value,
                "sourcePaymentStatus": row.get("WORK_STATUS"),
                "sourceTransactionId": None,
                "encodingIssue": encoding_issue,
                "settlementVerified": False,
                "geographyVerified": False,
                "approved": False,
                "reviewStatus": "pending",
            }
        )
    summary = {
        "source": "Official MPLADS eSAKSHI public expenditure report",
        "scope": "Odisha · default Lok Sabha dashboard filter; online records from 1 April 2023",
        "rows": len(normalized),
        "distinctWorkIds": len({r["workId"] for r in normalized}),
        "states": dict(Counter(r["state"] for r in normalized)),
        "sourceStatusCounts": dict(Counter(r["sourcePaymentStatus"] for r in normalized)),
        "encodingIssueRows": sum(r["encodingIssue"] for r in normalized),
        "missingDateRows": sum(r["expenditureDate"] is None for r in normalized),
        "invalidAmountRows": sum(r["sourceReportedDisbursedRupees"] is None for r in normalized),
        "approvedPayments": 0,
        "verifiedSettlementPayments": 0,
    }
    return normalized, summary


def main():
    manifest = json.loads((PRIVATE / "odisha-expenditure-response.json").read_text())
    raw = (PRIVATE / manifest["file"]).read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
        raise ValueError("Original checksum mismatch")
    records, summary = assess(raw)
    (PRIVATE / "odisha-normalized-review.json").write_text(
        json.dumps(
            {"source": manifest, "records": records, "summary": summary},
            indent=2,
            ensure_ascii=True,
        )
        + "\n"
    )
    (ROOT / "data/mplads-payment-source-assessment.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
