"""Preserve observed official payment downloads, with exact bill/project provenance.
Cheque records are not independently verified bank settlement or publication approval.
Run with the bundled Python runtime (pypdf).
"""

import hashlib, json, re, time
from decimal import Decimal
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlparse
from pypdf import PdfReader
import pdfplumber
from ppms_ifms import parse, ROOT


def cheque_fields(text):
    text = " ".join(text.split())
    match = re.search(
        r"Cheque Date & No\.:\s*(\d{2}-\d{2}-\d{4})\s*&\s*(\d+)\s*Cheque Amount:\s*(\d+(?:\.\d+)?)",
        text,
    )
    if match:
        return dict(
            chequeDate=match[1],
            chequeNumber=match[2],
            chequeAmount=match[3],
            dateBasis="Cheque date, not confirmed settlement date",
            amountBasis="Source cheque amount; gross/net and deductions interpretation pending",
            approved=False,
        )
    missing = re.search(r"Cheque Date & No\.:\s*-\s*&\s*Cheque Amount:\s*(\d+(?:\.\d+)?)", text)
    if missing:
        return dict(
            chequeDate=None,
            chequeNumber=None,
            chequeAmount=missing[1],
            dateBasis="Cheque date and number absent in original; settlement date unavailable",
            amountBasis="Source cheque amount; gross/net and deductions interpretation pending",
            approved=False,
        )
    return None


def recipient_rows(words, width):
    headers = [w for w in words if w["text"] == "Beneficiary" and w["top"] > 180]
    amount_headers = [w for w in words if w["text"] == "Amount" and w["top"] > 180]
    bank_headers = [w for w in words if w["text"] == "Bank" and w["top"] > 180]
    if len(headers) != 1 or len(amount_headers) != 1 or len(bank_headers) != 1:
        raise ValueError("Unexpected beneficiary table layout")
    name_x = headers[0]["x0"]
    bank_x = bank_headers[0]["x0"]
    amount_x = amount_headers[0]["x0"]
    header_bottom = max(w["bottom"] for w in words if 180 < w["top"] < 242)
    anchors = sorted(
        [
            w
            for w in words
            if w["x0"] < name_x - 10
            and w["top"] > header_bottom
            and re.fullmatch(r"\d+", w["text"])
        ],
        key=lambda w: w["top"],
    )
    clipped = amount_x >= width or any(
        w["x1"] > width for w in words if w["top"] > header_bottom and w["x0"] >= amount_x
    )
    records = []
    for i, a in enumerate(anchors):
        # Rows can wrap above/below vertically centred serial numbers. Midpoints
        # between adjacent serial anchors define row bounds for the observed layout.
        lower = (anchors[i - 1]["bottom"] + a["top"]) / 2 if i else header_bottom + 5
        upper = (
            (a["bottom"] + anchors[i + 1]["top"]) / 2 if i + 1 < len(anchors) else a["bottom"] + 35
        )
        selected = [w for w in words if lower <= w["top"] < upper]
        names = sorted(
            [w for w in selected if name_x - 1 <= w["x0"] < bank_x - 2],
            key=lambda w: (round(w["top"], 1), w["x0"]),
        )
        amounts = [
            w["text"]
            for w in selected
            if w["x0"] >= amount_x - 2 and re.fullmatch(r"\d+\.\d{2}", w["text"])
        ]
        name = " ".join(w["text"] for w in names)
        if not name or (not clipped and len(amounts) != 1):
            raise ValueError("Ambiguous beneficiary row")
        records.append(
            dict(
                serial=a["text"],
                sourceName=name,
                sourceRole="AE / JE"
                if re.search(r"AE\s*/\s*JE", name)
                else "Unclassified source beneficiary",
                amount=amounts[0] if not clipped else None,
                roleVerified=False,
            )
        )
    return dict(recipients=records, layoutClipped=clipped, bankingFieldsExcluded=True)


def main():
    base = ROOT / "data/acquisition/ppms/payment-details"
    base.mkdir(parents=True, exist_ok=True)
    candidates = json.loads(
        (ROOT / "data/acquisition/ppms/projects/five-panchayat-geotag-assessment.json").read_text()
    )["candidates"]
    rows = []
    for page in [
        ROOT / ".hisaab/ppms-balangir-ifms.html",
        *[ROOT / f".hisaab/ppms-balangir-ifms-{n}.html" for n in range(2, 5)],
    ]:
        rows.extend(parse(page.read_text()))
    assessments = []
    for candidate in candidates:
        code = candidate["project"]["projectCode"]
        for row in rows:
            if row["Project Code"] != code:
                continue
            links = [
                u
                for u in row["sourceLinks"]
                if urlparse(u).netloc == "ppms.odisha.gov.in"
                and urlparse(u).path.startswith("/report/download-ifms-payment-details/")
            ]
            for url in links:
                key = hashlib.sha256(url.encode()).hexdigest()
                checkpoint = base / (key + ".json")
                if checkpoint.exists():
                    metadata = json.loads(checkpoint.read_text())
                    raw = (base / metadata["file"]).read_bytes()
                    if hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
                        raise ValueError("Source checksum changed")
                else:
                    with urlopen(url, timeout=25) as response:
                        raw = response.read(10000001)
                        final = response.url
                    if len(raw) > 10000000 or not raw.lstrip().startswith(b"%PDF"):
                        raise ValueError("Payment download is not a bounded PDF")
                    sha = hashlib.sha256(raw).hexdigest()
                    filename = sha + ".pdf"
                    (base / filename).write_bytes(raw)
                    metadata = dict(
                        url=url,
                        finalUrl=final,
                        sha256=sha,
                        file=filename,
                        retrievedAt=datetime.now(timezone.utc).isoformat(),
                        approved=False,
                    )
                    checkpoint.write_text(json.dumps(metadata, indent=2) + "\n")
                    time.sleep(0.3)
                text = "\n".join(p.extract_text() for p in PdfReader(base / metadata["file"]).pages)
                (base / (metadata["sha256"] + ".txt")).write_text(text)
                cheque = cheque_fields(text)
                with pdfplumber.open(base / metadata["file"]) as document:
                    if len(document.pages) != 1:
                        raise ValueError("Multi-page beneficiary layout requires review")
                    breakdown = recipient_rows(
                        document.pages[0].extract_words(), document.pages[0].width
                    )
                detail_path = base / "pilot-visible-detail.json"
                if detail_path.exists():
                    detail = json.loads(detail_path.read_text())
                    if (
                        detail["projectCode"] == code
                        and detail["billSerial"] == row["Bill Serial No"]
                    ):
                        lookup = {v["serial"]: v for v in detail["records"]}
                        for recipient in breakdown["recipients"]:
                            v = lookup.get(recipient["serial"])
                            if (
                                not v
                                or v["sourceName"] != recipient["sourceName"]
                                or v["amount"] != recipient["amount"]
                            ):
                                raise ValueError("Visible detail/PDF recipient editions conflict")
                            recipient.update(
                                component=v["component"],
                                sourcePaymentStatus=v["sourcePaymentStatus"],
                                detailSourceUrl=detail["sourceUrl"],
                            )
                beneficiary_sum = (
                    str(sum((Decimal(r["amount"]) for r in breakdown["recipients"]), Decimal(0)))
                    if all(r["amount"] is not None for r in breakdown["recipients"])
                    else None
                )
                amount_match = bool(cheque) and Decimal(cheque["chequeAmount"]) == Decimal(
                    row["Total Expenditure Amount"]
                )
                assessments.append(
                    dict(
                        reportAmount=row["Total Expenditure Amount"],
                        chequeMatchesReportAmount=amount_match,
                        projectCode=code,
                        billSerial=row["Bill Serial No"],
                        source=metadata,
                        cheque=cheque,
                        beneficiaryBreakdown=breakdown,
                        beneficiarySum=beneficiary_sum,
                        beneficiariesMatchCheque=bool(
                            cheque
                            and beneficiary_sum is not None
                            and Decimal(beneficiary_sum) == Decimal(cheque["chequeAmount"])
                        ),
                        settlementVerified=False,
                        approved=False,
                    )
                )
    (base / "five-project-payment-assessment.json").write_text(
        json.dumps(dict(records=assessments, approved=False), indent=2) + "\n"
    )
    print(
        json.dumps(
            dict(
                downloads=len(assessments),
                withChequeFields=sum(bool(r["cheque"]) for r in assessments),
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
