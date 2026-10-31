"""Reconcile a small MPLADS sample with scoped official rows and document facts.

Neither a same-named work, an attachment flag, nor Payment Success grants
publication or independent settlement approval.
"""

import hashlib
import json
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE = ROOT / "data/acquisition/mplads/supporting-records"


def scope(row, house):
    if any(
        not row.get(k)
        for k in ["WORK_RECOMMENDATION_DTL_ID", "MP_NAME", "STATE_NAME", "CONSTITUENCY"]
    ):
        return None
    if row.get("HOUSE_OF_PARLIAMENT", house) != house:
        return None
    return (
        str(row["WORK_RECOMMENDATION_DTL_ID"]),
        row["MP_NAME"],
        row["STATE_NAME"],
        row["CONSTITUENCY"],
        house,
    )


def matches(row, candidate, house=2):
    return scope(row, house) is not None and scope(row, house) == scope(candidate, house)


def compare_bill(fact, financial_rows):
    values = [Decimal(str(r["FUND_DISBURSED_AMT"])) for r in financial_rows]
    # Reconciliation sum is provisional: no unique transaction IDs in this export.
    total = sum(values, Decimal(0))
    gross = fact.get("grossCappedRupees")
    net = fact.get("netPayableRupees")
    deductions = fact.get("deductionRupees")
    return {
        "sourceRowsReconciliationSumRupees": format(total, "f"),
        "sumIsVerifiedPaymentTotal": False,
        "billArithmeticMatches": bool(
            gross and net and deductions and Decimal(gross) - Decimal(deductions) == Decimal(net)
        ),
        "sourceRowsSumEqualsGrossBill": total == Decimal(gross) if gross else None,
        "sourceRowsSumEqualsNetPayable": total == Decimal(net) if net else None,
        "amountBasisConfirmed": False,
        "bankSettlementVerified": False,
    }


def load_report(directory, manifest_name, key):
    manifest = json.loads((directory / manifest_name).read_text())
    original = (directory / manifest["file"]).read_bytes()
    if hashlib.sha256(original).hexdigest() != manifest["sha256"]:
        raise ValueError("Source checksum mismatch")
    rows = json.loads(
        json.loads(original.decode("utf8", errors="surrogateescape"))[key], parse_float=Decimal
    )
    return [row for row in rows if "WORK_RECOMMENDATION_DTL_ID" in row]


def main():
    sanctions = load_report(PRIVATE, "odisha-sanctions.json", "Total Sanction Work")
    completed = load_report(PRIVATE, "odisha-completed.json", "Total Works Completed")
    payments = load_report(
        ROOT / "data/acquisition/mplads/public-script-review",
        "odisha-expenditure-response.json",
        "Total Expenditure",
    )
    selected = json.loads((PRIVATE / "selected-sample.json").read_text())
    facts = json.loads((PRIVATE / "document-observations.json").read_text())["observations"]
    cases = []
    for sample in selected:
        anchor = sample["completion"]
        rid = anchor["WORK_RECOMMENDATION_DTL_ID"]
        sanction_rows = [r for r in sanctions if matches(anchor, r)]
        completed_rows = [r for r in completed if matches(anchor, r)]
        financial_rows = [r for r in payments if matches(anchor, r)]
        work_ids = {r["WORK_ID"] for r in financial_rows}
        documents = []
        for mf in PRIVATE.glob(f"document-{rid}-*.json"):
            document = json.loads(mf.read_text())
            original = (PRIVATE / document["binaryFile"]).read_bytes()
            if hashlib.sha256(original).hexdigest() != document["binarySha256"]:
                raise ValueError("Document checksum mismatch")
            documents.append(document)
        document_facts = [f for f in facts if f["recommendationId"] == rid]
        bills = [f for f in document_facts if f["kind"] == "final-bill"]
        certificate_facts = [f for f in document_facts if f["kind"] == "completion-certificate"]
        cases.append(
            {
                "recommendationId": rid,
                "paymentWorkIds": sorted(work_ids),
                "completionInternalWorkId": anchor["WORK_ID"],
                "idNamespacesDiffer": True,
                "description": anchor["WORK_DESCRIPTION"],
                "scopedIdentityUnambiguous": len(sanction_rows) == 1
                and len(completed_rows) == 1
                and len(work_ids) == 1,
                "sanctions": sanction_rows,
                "portalCompletion": completed_rows,
                "sourceExpenditureRows": financial_rows,
                "documents": documents,
                "documentFacts": document_facts,
                "billComparisons": [compare_bill(f, financial_rows) for f in bills],
                "certificateAndPortalDateDiffer": any(
                    f.get("certificateCompletionDate")
                    and f["certificateCompletionDate"]
                    != __import__("datetime")
                    .datetime.strptime(anchor["ACTUAL_END_DATE"], "%d-%b-%Y")
                    .date()
                    .isoformat()
                    for f in certificate_facts
                ),
                "contractEvidenceVerified": False,
                "bankSettlementVerified": False,
                "geographyVerified": False,
                "approved": False,
                "reviewStatus": "owner review pending",
            }
        )
    # default=str retains exact Decimal values rather than binary-float rounding.
    (PRIVATE / "pilot-review.json").write_text(
        json.dumps({"cases": cases}, indent=2, ensure_ascii=True, default=str) + "\n"
    )
    public = {
        "sampleProjects": len(cases),
        "scopedIdentityMatches": sum(c["scopedIdentityUnambiguous"] for c in cases),
        "sourceExpenditureRows": sum(len(c["sourceExpenditureRows"]) for c in cases),
        "downloadedAttachments": sum(len(c["documents"]) for c in cases),
        "visuallyReviewedBills": sum(len(c["billComparisons"]) for c in cases),
        "visuallyReviewedCompletionCertificates": sum(
            sum(f["kind"] == "completion-certificate" for f in c["documentFacts"]) for c in cases
        ),
        "certificatePortalDateDifferences": sum(c["certificateAndPortalDateDiffer"] for c in cases),
        "billsWithSourceGrossNetDifference": sum(
            b["sourceRowsSumEqualsGrossBill"] and not b["sourceRowsSumEqualsNetPayable"]
            for c in cases
            for b in c["billComparisons"]
        ),
        "approvedPayments": 0,
        "bankSettlementVerified": 0,
    }
    (ROOT / "data/mplads-supporting-review-assessment.json").write_text(
        json.dumps(public, indent=2) + "\n"
    )
    print(json.dumps(public))


if __name__ == "__main__":
    main()
