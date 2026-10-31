"""Bounded, resumable payment-document assessment from observed report links.
Never promotes cheque dates, beneficiary rows or source status to settlement.
"""

import argparse, hashlib, json, time, re
from datetime import datetime, timezone
from decimal import Decimal
from urllib.request import urlopen
from urllib.parse import urlparse
import pdfplumber
from pypdf import PdfReader
from ppms_ifms import ROOT
from ppms_payment_details import cheque_fields, recipient_rows
from ppms_payment_integrity import audit as audit_originals


def conflicting_bill_keys(catalogue):
    # Conservatively quarantine every edition of a project/bill serial when
    # its source amount/status differs. A newer page is not a proven correction.
    return {(c["identity"][0], c["identity"][1]) for c in catalogue.get("conflicts", [])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--retry-failures", action="store_true")
    parser.add_argument("--review-only", action="store_true")
    parser.add_argument("--max-downloads", type=int, default=20)
    parser.add_argument(
        "--project-scope", choices=["statewide", "balangir-dossiers"], default="statewide"
    )
    args = parser.parse_args()
    if not 1 <= args.max_downloads <= 20:
        raise ValueError("Use up to twenty downloads per batch")
    base = ROOT / "data/acquisition/ppms/state-payment-details"
    base.mkdir(parents=True, exist_ok=True)
    catalogue = json.loads(
        (ROOT / "data/acquisition/ppms/state-assessment/state-batch-assessment.json").read_text()
    )
    conflicts = conflicting_bill_keys(catalogue)
    previous = (
        json.loads((base / "assessment.json").read_text())
        if (base / "assessment.json").exists()
        else dict(records=[], failures=[])
    )
    if args.retry_failures and (base / "assessment.json").exists():
        old = (base / "assessment.json").read_bytes()
        (base / (hashlib.sha256(old).hexdigest() + ".assessment.json")).write_bytes(old)
    records = previous["records"]
    failures = [] if args.retry_failures else previous["failures"]
    attempted = {r["sourceUrl"] for r in records + failures}
    processed = 0
    originals = {
        r["sourceUrl"]: r["source"]
        for r in previous["records"] + previous["failures"]
        if r.get("source")
    }
    eligible = catalogue["records"]
    if args.project_scope == "balangir-dossiers":
        dossiers = json.loads(
            (ROOT / "data/acquisition/ppms/projects/balangir-dossiers.json").read_text()
        )["dossiers"]
        codes = {
            d["projectCode"] for d in dossiers if d.get("project") and not d.get("projectConflict")
        }
        eligible = [r for r in eligible if r["Project Code"] in codes]
    for row in [] if args.review_only else eligible:
        if (row["Project Code"], row["Bill Serial No"]) in conflicts:
            continue
        if row["Status"] == "Failed":
            continue
        for url in row["sourceLinks"]:
            p = urlparse(url)
            if (
                p.netloc != "ppms.odisha.gov.in"
                or not p.path.startswith("/report/download-ifms-payment-details/")
                or url in attempted
            ):
                continue
            if processed >= args.max_downloads:
                break
            processed += 1
            attempted.add(url)
            identity = dict(
                projectCode=row["Project Code"],
                billSerial=row["Bill Serial No"],
                sourceUrl=url,
                reportSourceUrl=row["sourceUrl"],
                reportAmount=row["Total Expenditure Amount"],
            )
            source = None
            try:
                if url in originals:
                    source = originals[url]
                    file = source["file"]
                    sha = source["sha256"]
                    raw = (base / file).read_bytes()
                    if hashlib.sha256(raw).hexdigest() != sha:
                        raise ValueError("Preserved payment checksum mismatch")
                else:
                    with urlopen(url, timeout=25) as response:
                        raw = response.read(10000001)
                    if len(raw) > 10000000 or not raw.lstrip().startswith(b"%PDF"):
                        raise ValueError("Download is not a bounded PDF")
                    sha = hashlib.sha256(raw).hexdigest()
                    file = sha + ".pdf"
                    (base / file).write_bytes(raw)
                    source = dict(
                        file=file, sha256=sha, retrievedAt=datetime.now(timezone.utc).isoformat()
                    )
                reader = PdfReader(base / file)
                text = "\n".join(p.extract_text() for p in reader.pages)
                (base / (sha + ".txt")).write_text(text)
                cheque = cheque_fields(text)
                if not cheque:
                    raise ValueError("Cheque fields missing; original retained for manual review")
                with pdfplumber.open(base / file) as document:
                    if len(document.pages) != 1:
                        raise ValueError("Multi-page layout needs manual review")
                    breakdown = recipient_rows(
                        document.pages[0].extract_words(), document.pages[0].width
                    )
                total = (
                    str(sum((Decimal(r["amount"]) for r in breakdown["recipients"]), Decimal(0)))
                    if all(r["amount"] is not None for r in breakdown["recipients"])
                    else None
                )
                ref = re.search(r"Treasury Code:\s*(\S+)\s*Reference ID:\s*(\S+)", text)
                source_identity = (
                    "/".join([ref[1], ref[2], cheque["chequeNumber"]])
                    if ref and cheque["chequeNumber"]
                    else None
                )
                records.append(
                    dict(
                        **identity,
                        source=source,
                        sourcePaymentIdentity=source_identity,
                        cheque=cheque,
                        beneficiaryBreakdown=breakdown,
                        beneficiarySum=total,
                        chequeMatchesReportAmount=Decimal(cheque["chequeAmount"])
                        == Decimal(row["Total Expenditure Amount"]),
                        beneficiariesMatchCheque=total is not None
                        and Decimal(total) == Decimal(cheque["chequeAmount"]),
                        associationBasis="Official download linked from exact project/bill row; allocation review pending",
                        settlementVerified=False,
                        approved=False,
                    )
                )
            except Exception as e:
                failures.append(
                    dict(
                        **identity,
                        source=source,
                        error=str(e),
                        retry="Manual inspection or next authorized retry; no zero amount substituted",
                    )
                )
            time.sleep(0.3)
        if processed >= args.max_downloads:
            break
    ledger = {}
    for r in records:
        r["reportConflict"] = (r["projectCode"], r["billSerial"]) in conflicts
        key = r["sourcePaymentIdentity"]
        if key:
            ledger.setdefault(key, []).append(r)
    shared = [
        dict(
            sourcePaymentIdentity=k,
            projectCodes=sorted({r["projectCode"] for r in v}),
            billSerials=sorted({r["billSerial"] for r in v}),
            allocationVerified=False,
        )
        for k, v in ledger.items()
        if len({r["projectCode"] for r in v}) > 1
    ]
    assessment = dict(
        records=records,
        failures=failures,
        sharedIdentities=shared,
        approved=False,
        scope="Bounded subset of collected statewide bill-linked downloads",
    )
    integrity = audit_originals(base, assessment, catalogue)
    (base / "assessment.json").write_text(json.dumps(assessment, indent=2) + "\n")
    (base / "integrity-audit-current.json").write_text(json.dumps(integrity, indent=2) + "\n")
    summary = dict(
        documentsPreserved=len(records) + sum(r.get("source") is not None for r in failures),
        documents=len(records),
        failures=len(failures),
        districtsNotAssessed=True,
        clippedDocuments=sum(r["beneficiaryBreakdown"]["layoutClipped"] for r in records),
        chequeReportConflicts=sum(not r["chequeMatchesReportAmount"] for r in records),
        beneficiarySumConflicts=sum(
            not r["beneficiariesMatchCheque"] and not r["beneficiaryBreakdown"]["layoutClipped"]
            for r in records
        ),
        sharedPaymentIdentities=len(shared),
        quarantinedBillIdentities=len(conflicts),
        documentsWithReportConflict=sum(r["reportConflict"] for r in records),
        approvedPayments=0,
    )
    summary.update(attemptedThisBatch=processed, lastCollectionScope=args.project_scope)
    (ROOT / "data/ppms-state-payment-acquisition.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
