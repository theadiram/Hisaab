"""Preserve and assess legacy XLS cashbooks; never publish project payments automatically.

Requires xlrd for BIFF XLS input. Voucher dates remain accounting dates, not
independently verified bank settlement dates. Amounts are kept in source units.
"""

import argparse
import hashlib
import json
import re
import shutil
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def decimal(value):
    return Decimal(str(value or 0))


def parse_rows(rows):
    if rows[3][:3] != ["Date", "Voucher No", "Cheque No"] or rows[3][7:10] != [
        "Date",
        "Voucher No",
        "Cheque No",
    ]:
        raise ValueError("Unsupported cashbook headings")
    records = []
    for i, row in enumerate(rows):
        for offset, direction in [(0, "receipt"), (7, "payment")]:
            date = str(row[offset])
            if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", date):
                continue
            classification = str(rows[i + 1][offset])
            particulars = str(rows[i + 2][offset])
            if not classification.startswith("Classification:") or not particulars.startswith(
                "Particulars:"
            ):
                raise ValueError("Missing voucher context")
            accounts = dict(
                zip(
                    ["cash", "treasuryPD", "bank", "postOffice"],
                    [str(decimal(v)) for v in row[offset + 3 : offset + 7]],
                )
            )
            amount = sum((Decimal(v) for v in accounts.values()), Decimal(0))
            listed = [
                Decimal(v) for v in re.findall(r"\bRS\s+(\d+(?:\.\d+)?)", particulars, flags=re.I)
            ]
            cr = re.search(r"\bCR\s+NO\s+(\d+-\d{4}-\d{2})", particulars, flags=re.I)
            records.append(
                dict(
                    direction=direction,
                    voucherId=str(row[offset + 1]),
                    accountingDate=datetime.strptime(date, "%d/%m/%Y").date().isoformat(),
                    sourceRows=[i + 1, i + 2, i + 3],
                    accounts=accounts,
                    sourceAmount=str(amount),
                    unit="cashbook source units; rupees corroborated where particulars say RS",
                    classification=classification,
                    particulars=particulars,
                    localWorkReference=cr.group(1) if cr else None,
                    listedRecipientAmounts=[str(v) for v in listed],
                    recipientAmountConflict=bool(len(listed) > 1 and sum(listed) != amount),
                    amountBasis="unknown",
                    bankSettlementVerified=False,
                    approved=False,
                )
            )
    identities = [(r["direction"], r["voucherId"]) for r in records]
    if len(identities) != len(set(identities)):
        raise ValueError("Duplicate voucher identities in source")
    opening = [decimal(v) for v in rows[4][3:7]]
    closing = [decimal(v) for v in rows[-1][10:14]]
    incoming = sum(
        (Decimal(r["sourceAmount"]) for r in records if r["direction"] == "receipt"), Decimal(0)
    )
    outgoing = sum(
        (Decimal(r["sourceAmount"]) for r in records if r["direction"] == "payment"), Decimal(0)
    )
    if sum(opening) + incoming - outgoing != sum(closing):
        raise ValueError("Cashbook balance does not reconcile")
    return dict(
        title=rows[0][0],
        closedStatement=rows[1][0],
        records=records,
        reconciliation=dict(
            openingBalance=str(sum(opening)),
            receipts=str(incoming),
            payments=str(outgoing),
            closingBalance=str(sum(closing)),
            balanced=True,
        ),
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("file", type=Path)
    args = parser.parse_args()
    import xlrd

    original = args.file.read_bytes()
    checksum = hashlib.sha256(original).hexdigest()
    book = xlrd.open_workbook(file_contents=original)
    if book.nsheets != 1:
        raise ValueError("Unexpected sheet count")
    sheet = book.sheet_by_index(0)
    result = parse_rows([sheet.row_values(i) for i in range(sheet.nrows)])
    if (
        result["title"]
        != "Cash Book of Gram Panchayat: Chandanbhati for the Month of March Financial Year 2025-2026"
    ):
        raise ValueError("Pilot scope differs; assess separately")
    directory = ROOT / "data/acquisition/egramswaraj"
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / (checksum + ".xls")
    if not target.exists():
        shutil.copyfile(args.file, target)
    result["provenance"] = dict(
        sha256=checksum,
        originalFilename=args.file.name,
        sourceUrl="https://egramswaraj.gov.in/cashBookPublic.do",
        retrievedOn="2026-10-07",
        filters=dict(
            year="2025-2026",
            state="Odisha",
            district="Balangir",
            block="Balangir",
            panchayat="Chandanbhati",
            month="March",
        ),
        accessBasis="Official public report downloaded after user completed CAPTCHA",
        publicationBasis="Reuse/export authorization pending; private assessment only",
    )
    (directory / "chandanbhati-march-2026.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            dict(
                sha256=checksum,
                receipts=sum(r["direction"] == "receipt" for r in result["records"]),
                payments=sum(r["direction"] == "payment" for r in result["records"]),
                workReferences=sorted(
                    {r["localWorkReference"] for r in result["records"] if r["localWorkReference"]}
                ),
                conflictingVouchers=[
                    r["voucherId"] for r in result["records"] if r["recipientAmountConflict"]
                ],
                reconciliation=result["reconciliation"],
            )
        )
    )


if __name__ == "__main__":
    main()
