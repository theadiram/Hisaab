#!/usr/bin/env python3
"""Index one public Puducherry monthly accounts compilation, without totals.

Voucher rows are kept as private accounts evidence candidates. They may include
receipts, refunds, suspense adjustments, or expenditure and do not by themselves
prove bank settlement, project allocation, recipient identity, or development.
"""

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
DOWNLOAD_MANIFEST = (
    ROOT / "data/acquisition/national-coverage/puducherry-monthly-download-manifest.json"
)
OUTPUT_PATH = ROOT / "data/acquisition/national-coverage/puducherry-accounts-2026-27-index.json"
VOUCHER = re.compile(r"^\s*(\d+)\s+(\d{2}/\d{2}/\d{4})\s+(\d+)\s+(.*\S)\s*$")
HEAD = re.compile(r"^\s*Head of Account\s*:\s*(.*\S)\s*$")
UNIT = re.compile(r"^\s*Unit\s*:\s*(.*\S)\s*$")


def extract_pages(pages, region=None, source_url=None, source_hash=None):
    records = []
    for page_number, text in enumerate(pages, start=1):
        head = None
        unit = None
        for line_number, line in enumerate(text.splitlines(), start=1):
            hm = HEAD.match(line)
            if hm:
                head = hm.group(1).strip()
                continue
            um = UNIT.match(line)
            if um:
                unit = um.group(1).strip()
                continue
            match = VOUCHER.match(line)
            if not match:
                continue
            date = match.group(2)
            # Reject malformed dates rather than quietly indexing bad evidence.
            from datetime import datetime

            datetime.strptime(date, "%d/%m/%Y")
            records.append(
                {
                    "region": region,
                    "sourceUrl": source_url,
                    "sourceHash": source_hash,
                    "page": page_number,
                    "line": line_number,
                    "unit": unit,
                    "headOfAccount": head,
                    "voucherNumber": match.group(1),
                    "voucherDate": date,
                    "tokenNumber": match.group(3),
                    "rawLine": line.strip(),
                    "evidenceType": "source_reported_accounts_voucher_candidate",
                    "projectLinked": False,
                    "settlementVerified": False,
                    "developmentClassification": None,
                    "reviewStatus": "private_unreviewed_source_line",
                }
            )
    return records


def run():
    records = []
    sources = []
    manifest = json.loads(DOWNLOAD_MANIFEST.read_text())
    for source in manifest["reports"]:
        region = source["region"]
        url = source["sourceUrl"]
        source_path = ROOT / source["originalPath"]
        if not source_path.exists():
            raise FileNotFoundError(f"Official original not found: {source_path}")
        content = source_path.read_bytes()
        if not content.startswith(b"%PDF-"):
            raise ValueError(f"Preserved source is not a PDF: {source_path}")
        digest = hashlib.sha256(content).hexdigest()
        if digest != source["sha256"]:
            raise ValueError(f"Checksum mismatch: {source_path}")
        pages = [page.extract_text() or "" for page in PdfReader(source_path).pages]
        rows = extract_pages(pages, region=region, source_url=url, source_hash=digest)
        records.extend(rows)
        sources.append(
            {
                "region": region,
                "sourceUrl": url,
                "originalPath": str(source_path.relative_to(ROOT)),
                "sha256": digest,
                "pageCount": len(pages),
                "voucherLineCount": len(rows),
                "distinctAccountHeadCount": len({r["headOfAccount"] for r in rows}),
            }
        )
    result = {
        "jurisdiction": "Puducherry",
        "sourceTitle": "Government of Puducherry, Directorate of Accounts and Treasuries, Compilation Reports for 1–31 August 2026",
        "sourceUrl": "https://dat.py.gov.in/expenditures",
        "sources": sources,
        "sourcePeriod": {"from": "2026-08-01", "to": "2026-08-31"},
        "printedOn": "2026-09-03",
        "retrievedOn": manifest["lastIndexedOn"],
        "periodScope": manifest["editionScope"],
        "listedReports": manifest["listedReportCount"],
        "collectedReports": manifest["completedDownloadCount"],
        "pendingListedReports": manifest["pendingListedCount"],
        "unlistedRegionMonthCombinations": 24 - manifest["listedReportCount"],
        "pageCount": sum(s["pageCount"] for s in sources),
        "voucherLineCount": len(records),
        "distinctAccountHeadCount": len({r["headOfAccount"] for r in records}),
        "records": records,
        "limitations": [
            "Voucher/account compilation entries are not independent bank-settlement proof.",
            "The report contains receipts, refunds, suspense and other account heads; do not treat every voucher as a development payment.",
            "No project identifier, procurement contract, contractor identity, or project-location allocation is established by this index.",
            "Amounts remain in source text and have not been normalized, summed, classified, or published.",
            "Source reuse conditions have not been reviewed; this index and original remain private.",
        ],
        "publicationApproved": False,
        "rightsReviewed": False,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


if __name__ == "__main__":
    result = run()
    print(
        json.dumps(
            {
                "jurisdiction": result["jurisdiction"],
                "regions": len(result["sources"]),
                "pageCount": result["pageCount"],
                "voucherLineCount": result["voucherLineCount"],
                "sources": result["sources"],
            }
        )
    )
