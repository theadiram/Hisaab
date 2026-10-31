#!/usr/bin/env python3
"""Checkpointed public-download collector for Puducherry monthly accounts PDFs.

Only follows PDF links listed on the official Directorate of Accounts and
Treasuries expenditure page. Each run is bounded; originals and its manifest
are private under data/acquisition/.
"""

import hashlib
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_URL = "https://dat.py.gov.in/expenditures"
BASE = ROOT / "data/acquisition/national-coverage"
ORIGINALS = BASE / "originals"
MANIFEST = BASE / "puducherry-monthly-download-manifest.json"
MONTHS = {"apr": "04", "may": "05", "jun": "06", "jul": "07", "aug": "08", "sep": "09"}
REGIONS = {"pdy": "puducherry", "kkl": "karaikal", "mhe": "mahe", "ynm": "yanam"}
LINK = re.compile(
    r"https://dat\.py\.gov\.in/sites/default/files/acctscomp([a-z]{3})(2026)(pdy|kkl|mhe|ynm)\.pdf"
)


def download(limit=20):
    if not 1 <= limit <= 20:
        raise ValueError("One run may download between 1 and 20 reports")
    headers = {"User-Agent": "Mozilla/5.0 (compatible; HisaabPublicRecordsResearch/1.0)"}
    with urllib.request.urlopen(
        urllib.request.Request(INDEX_URL, headers=headers), timeout=30
    ) as response:
        html = response.read().decode("utf-8", "replace")
    links = sorted(set(LINK.findall(html)))
    listed = []
    for month, year, region in links:
        if month not in MONTHS:
            continue
        filename = f"puducherry-expenditure-{year}-{MONTHS[month]}-{REGIONS[region]}.pdf"
        listed.append(
            (
                f"https://dat.py.gov.in/sites/default/files/acctscomp{month}{year}{region}.pdf",
                filename,
                REGIONS[region],
            )
        )
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    old = (
        json.loads(MANIFEST.read_text())
        if MANIFEST.exists()
        else {"indexUrl": INDEX_URL, "reports": []}
    )
    by_file = {row["originalPath"].split("/")[-1]: row for row in old["reports"]}
    pending = []
    for url, filename, region in listed:
        path = ORIGINALS / filename
        if filename in by_file:
            continue
        if path.exists():
            body = path.read_bytes()
            if not body.startswith(b"%PDF-"):
                raise ValueError(f"Existing file is not a PDF: {path}")
            by_file[filename] = {
                "region": region,
                "sourceUrl": url,
                "originalPath": str(path.relative_to(ROOT)),
                "sha256": hashlib.sha256(body).hexdigest(),
                "bytes": len(body),
                "retrievedOn": None,
                "status": "private_original_preserved_unreviewed",
            }
        else:
            pending.append((url, filename, region))
    completed = []
    for url, filename, region in pending[:limit]:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=45) as response:
            body = response.read()
            content_type = response.headers.get("Content-Type", "")
        if not body.startswith(b"%PDF-") or "pdf" not in content_type.lower():
            raise ValueError(f"Official download was not a PDF: {url} ({content_type})")
        path = ORIGINALS / filename
        path.write_bytes(body)
        row = {
            "region": region,
            "sourceUrl": url,
            "originalPath": str(path.relative_to(ROOT)),
            "sha256": hashlib.sha256(body).hexdigest(),
            "bytes": len(body),
            "retrievedOn": datetime.now(timezone.utc).date().isoformat(),
            "status": "private_original_preserved_unreviewed",
        }
        by_file[filename] = row
        completed.append(row)
    old["editionScope"] = (
        "FY2026-27 monthly accounts; April–September 2026 where reports are listed"
    )
    old["lastIndexedOn"] = datetime.now(timezone.utc).date().isoformat()
    old["listedReportCount"] = len(listed)
    old["completedDownloadCount"] = len(by_file)
    old["pendingListedCount"] = max(0, len(listed) - len(by_file))
    old["reports"] = sorted(by_file.values(), key=lambda r: r["originalPath"])
    old["note"] = (
        "Only public PDF links shown by the official expenditure page are collected. A missing region/month link is unreported here, not zero expenditure. Voucher rows are not assumed to be development payments or bank settlements."
    )
    MANIFEST.write_text(json.dumps(old, ensure_ascii=False, indent=2) + "\n")
    return {
        "listed": len(listed),
        "downloadedThisRun": len(completed),
        "totalDownloaded": len(by_file),
        "pendingListed": old["pendingListedCount"],
        "new": completed,
    }


if __name__ == "__main__":
    print(json.dumps(download(), ensure_ascii=False))
