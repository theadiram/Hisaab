#!/usr/bin/env python3
"""Index broad CAG state-account indicators from privately preserved PDFs.

These are unaudited/provisional state aggregates, not development-only
expenditure or project-level payments. Each report is kept as its own snapshot;
the parser never adds months or projects values to Hisaab's public dataset.
"""

import hashlib
import json
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/national-coverage"
MANIFEST = BASE / "cag-state-accounts-manifest.json"
OUTPUT = BASE / "cag-state-accounts-indicators.json"
MANUAL_REVIEW = BASE / "cag-state-accounts-manual-review.json"
NUMBER = re.compile(r"(?<![A-Za-z0-9])[-+]?(?:\d[\d,]*)?\.\d{2}")
IN_SCOPE = [
    ("Total Expenditure", re.compile(r"^total\s+expenditure\b", re.I)),
    ("Revenue Expenditure", re.compile(r"^revenue\s+expenditure\b", re.I)),
    ("Capital Expenditure", re.compile(r"^capital\s+expenditure\b", re.I)),
    ("Total Receipts", re.compile(r"^total\s+receipts\b", re.I)),
    ("Revenue Receipts", re.compile(r"^revenue\s+receipts\b", re.I)),
    ("Capital Receipts", re.compile(r"^capital\s+receipts\b", re.I)),
    ("General Sector", re.compile(r"^general\s+sector\b", re.I)),
    ("Social Sector", re.compile(r"^social\s+sector\b", re.I)),
    ("Economic Sector", re.compile(r"^economic\s+sector\b", re.I)),
    (
        "Grants-in-aid-Contributions",
        re.compile(r"^grants?\s*[-–]?in\s*[-–]?aid\s*[-–]?contributions?\b", re.I),
    ),
    ("Loans & Advances disbursed", re.compile(r"^loans\s*&\s*advances\s+disbursed\b", re.I)),
]


def amount(value):
    """Return exact decimal string with Indian grouping removed; preserve .00."""
    return format(Decimal(value.replace(",", "")), "f")


def parse_indicator_line(line):
    normalized = re.sub(r"\s+", " ", line).replace("−", "-").strip()
    row_text = re.sub(r"^(?:\(?\d+\)?[.)]?|\([ivxlcdm]+\))[\s.]*", "", normalized, flags=re.I)
    matched = next(
        (
            (label, pattern.match(row_text))
            for label, pattern in IN_SCOPE
            if pattern.match(row_text)
        ),
        None,
    )
    if not matched:
        return None
    label, label_match = matched
    numbers = [m.group() for m in NUMBER.finditer(row_text, label_match.end())]
    if len(numbers) < 2:
        return None
    return {
        "sourceRowLabel": label,
        "budgetEstimateCroreText": amount(numbers[0]),
        "actualsUpToReportingPeriodCroreText": amount(numbers[1]),
        "actualPercentOfBudgetText": numbers[2] if len(numbers) > 2 else None,
        "correspondingPriorPeriodPercentText": numbers[3] if len(numbers) > 3 else None,
    }


def extract_report(report):
    path = ROOT / report["originalPath"]
    body_hash = hashlib.sha256(path.read_bytes()).hexdigest()
    if body_hash != report["sha256"]:
        raise ValueError(f"Checksum mismatch: {report['state']} {report['month']}")
    reader = PdfReader(str(path))
    if not reader.pages:
        raise ValueError(f"Empty PDF: {path}")
    all_page_text = [page.extract_text(extraction_mode="layout") or "" for page in reader.pages]
    page_text = all_page_text[0]
    manual = (
        json.loads(MANUAL_REVIEW.read_text()).get("reviews", {}).get(report["state"])
        if MANUAL_REVIEW.exists()
        else None
    )
    if manual:
        if manual.get("sourceSha256") != body_hash:
            raise ValueError(
                f"Manual review checksum mismatch: {report['state']} {report['month']}"
            )
        if (
            manual.get("sourcePage") != 1
            or manual.get("reviewMethod") != "visual_transcription_of_original_pdf_page"
        ):
            raise ValueError(f"Unsupported manual review provenance: {report['state']}")
        records = []
        for row in manual["rows"]:
            records.append(
                {
                    "sourceRowLabel": row["sourceRowLabel"],
                    "budgetEstimateCroreText": amount(row["budgetEstimateCroreText"]),
                    "actualsUpToReportingPeriodCroreText": amount(
                        row["actualsUpToReportingPeriodCroreText"]
                    ),
                    "actualPercentOfBudgetText": row.get("actualPercentOfBudgetText"),
                    "correspondingPriorPeriodPercentText": row.get(
                        "correspondingPriorPeriodPercentText"
                    ),
                    "reportingPeriod": manual["reportingPeriod"],
                    "sourcePage": manual["sourcePage"],
                    "sourceTextLine": None,
                    "sourceUnit": manual["sourceUnit"],
                    "sourceExtractionMethod": "manual_transcription_visual_page_review",
                    "reviewNote": "Transcribed from the preserved original PDF page image; broad aggregate only, not independently reviewed for publication.",
                    "accountBasis": "CAG Monthly Key Indicators · unaudited provisional state aggregate",
                    "developmentClassification": "unreviewed_mixed_or_non_development",
                    "publicationApproved": False,
                }
            )
        return {
            "jurisdiction": report["state"],
            "financialYear": "2026-27",
            "reportMonth": report["month"],
            "reportYear": report["year"],
            "sourceUrl": report["sourceUrl"],
            "sourceSha256": body_hash,
            "sourceOriginalPath": report["originalPath"],
            "pdfPageCount": len(reader.pages),
            "statusLabel": "unaudited_provisional",
            "sourceUnit": manual["sourceUnit"],
            "unitSourcePage": manual["sourcePage"],
            "reportingPeriod": manual["reportingPeriod"],
            "amountsSummedAcrossSnapshots": False,
            "developmentOnly": False,
            "projectPaymentEvidence": False,
            "records": records,
            "extractionStatus": "manually_transcribed_visual_review_candidate_rows",
            "missingExpectedRows": [],
            "manualReviewProvenance": manual["reviewMethod"],
        }
    status_match = re.search(r"un-?audited\s+provisional\s+figures", page_text, re.I)
    status = "unaudited_provisional" if status_match else "status_not_extracted_from_page_1"
    unit_page = next(
        (
            (n, text)
            for n, text in enumerate(all_page_text, 1)
            if re.search(r"\bin\s+(crores?|lakhs?)\b", text, re.I)
        ),
        None,
    )
    unit_match = re.search(r"\bin\s+(crores?|lakhs?)\b", unit_page[1], re.I) if unit_page else None
    unit = unit_match.group(1).lower() if unit_match else None
    if unit is None:
        raise ValueError(f"Currency unit missing: {report['state']}")
    if unit not in {"crore", "crores"}:
        raise ValueError(f"Unsupported currency unit for crore fields: {report['state']} {unit}")
    period_match = re.search(r"Actuals up to\s+([A-Za-z]+\s+\d{4})", page_text, re.I)
    reporting_period = (
        period_match.group(1) if period_match else f"{report['month']} {report['year']}"
    )
    records = []
    for line_no, line in enumerate(page_text.splitlines(), 1):
        candidate = parse_indicator_line(line)
        if not candidate:
            continue
        records.append(
            {
                **candidate,
                "reportingPeriod": reporting_period,
                "sourcePage": 1,
                "sourceTextLine": line_no,
                "sourceUnit": f"₹ in {unit}",
                "accountBasis": (
                    "CAG Monthly Key Indicators · unaudited provisional state aggregate"
                    if status == "unaudited_provisional"
                    else "CAG Monthly Key Indicators · status not extracted from first-page text"
                ),
                "developmentClassification": "unreviewed_mixed_or_non_development",
                "publicationApproved": False,
            }
        )
    labels = {r["sourceRowLabel"] for r in records}
    required = {"Revenue Expenditure", "Capital Expenditure", "Total Expenditure"}
    return {
        "jurisdiction": report["state"],
        "financialYear": "2026-27",
        "reportMonth": report["month"],
        "reportYear": report["year"],
        "sourceUrl": report["sourceUrl"],
        "sourceSha256": body_hash,
        "sourceOriginalPath": report["originalPath"],
        "pdfPageCount": len(reader.pages),
        "statusLabel": status,
        "sourceUnit": f"₹ in {unit}",
        "unitSourcePage": unit_page[0],
        "reportingPeriod": reporting_period,
        "amountsSummedAcrossSnapshots": False,
        "developmentOnly": False,
        "projectPaymentEvidence": False,
        "records": records,
        "extractionStatus": "indexed_candidate_rows"
        if records
        else "layout_or_scan_requires_manual_review",
        "missingExpectedRows": sorted(required - labels),
    }


def build(manifest_path=MANIFEST, output_path=OUTPUT):
    manifest = json.loads(Path(manifest_path).read_text())
    reports = [
        r for r in manifest["reports"] if r.get("downloadStatus") == "downloaded_private_unreviewed"
    ]
    snapshots = []
    for report in reports:
        try:
            snapshots.append(extract_report(report))
        except Exception as exc:
            snapshots.append(
                {
                    "jurisdiction": report["state"],
                    "financialYear": "2026-27",
                    "reportMonth": report["month"],
                    "sourceUrl": report["sourceUrl"],
                    "sourceSha256": report["sha256"],
                    "sourceOriginalPath": report["originalPath"],
                    "extractionStatus": "manual_review_required",
                    "extractionError": f"{type(exc).__name__}: {exc}",
                    "records": [],
                    "publicationApproved": False,
                }
            )
    result = {
        "source": "Comptroller and Auditor General of India, State Accounts Report",
        "indexedOn": date.today().isoformat(),
        "snapshotCount": len(snapshots),
        "snapshots": snapshots,
        "limitations": [
            "Monthly Key Indicators are broad state aggregates and are explicitly unaudited/provisional.",
            "Budget estimate and actual columns are preserved as exact source text in ₹ crore; they are not reclassified as development funding.",
            "Snapshots use different reporting months and may be cumulative. Never add one month to another.",
            "Revenue/capital and sector aggregates overlap their parent totals. Do not sum parent and child rows.",
            "No report establishes asset, contract, recipient, location, work completion, or bank settlement.",
            "Private working index only; source and republication review is still required.",
        ],
    }
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    Path(output_path).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


if __name__ == "__main__":
    result = build()
    print(
        json.dumps(
            {
                "snapshots": result["snapshotCount"],
                "states": [s["jurisdiction"] for s in result["snapshots"]],
                "records": sum(len(s["records"]) for s in result["snapshots"]),
                "output": str(OUTPUT.relative_to(ROOT)),
            },
            ensure_ascii=False,
        )
    )
