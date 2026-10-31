#!/usr/bin/env python3
"""Collect latest listed CAG state monthly-account indicators, checkpointed.

The CAG reports are broad monthly account indicators, not development-only
spending or project-payment records. Downloads are private and never summed.
"""

import hashlib
import html
import json
import re
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_URL = "https://cag.gov.in/en/state-accounts-report"
BASE = ROOT / "data/acquisition/national-coverage"
ORIGINALS = BASE / "originals/cag-state-accounts"
MANIFEST = BASE / "cag-state-accounts-manifest.json"
STATES = {
    "Andhra Pradesh",
    "Arunachal Pradesh",
    "Assam",
    "Bihar",
    "Chhattisgarh",
    "Goa",
    "Gujarat",
    "Haryana",
    "Himachal Pradesh",
    "Jharkhand",
    "Karnataka",
    "Kerala",
    "Madhya Pradesh",
    "Maharashtra",
    "Manipur",
    "Meghalaya",
    "Mizoram",
    "Nagaland",
    "Odisha",
    "Punjab",
    "Rajasthan",
    "Sikkim",
    "Tamil Nadu",
    "Telangana",
    "Tripura",
    "Uttar Pradesh",
    "Uttarakhand",
    "West Bengal",
}
MONTHS = {
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12,
    "January": 1,
    "February": 2,
    "March": 3,
}
MONTH_RE = re.compile(
    r"^(April|May|June|July|August|September|October|November|December|January|February|March),\s*(2026|2027)$"
)
STATE_SUBSITE_SLUGS = {
    "Andhra Pradesh": "andhra-pradesh",
    "Manipur": "manipur",
    "Telangana": "telangana",
}


def read_url(url, timeout=45):
    request = urllib.request.Request(
        url, headers={"User-Agent": "Mozilla/5.0 (compatible; HisaabPublicAccountsResearch/1.0)"}
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def state_pages(index_html):
    anchors = re.findall(
        r'<a\b[^>]*href=["\']([^"\']*defuat_state_id=\d+)["\'][^>]*>(.*?)</a>',
        index_html,
        re.I | re.S,
    )
    found = {}
    for href, label in anchors:
        name = re.sub(r"<[^>]+>", " ", label)
        name = re.sub(r"\s+", " ", html.unescape(name)).strip()
        if name in STATES:
            found[name] = urllib.parse.urljoin(INDEX_URL, html.unescape(href))
    missing = STATES - set(found)
    if missing:
        raise ValueError(f"CAG state index did not expose expected states: {sorted(missing)}")
    return found


def latest_report(state, state_url, page_html):
    section_match = re.search(
        r'<(?P<tag>div|li)\s+class=["\']accTrigger["\']>\s*2026\s*-\s*27\s*</(?P=tag)>(?P<content>.*?)(?=<(?:div|li)\s+class=["\']accTrigger["\']|\Z)',
        page_html,
        re.I | re.S,
    )
    if not section_match:
        return {"state": state, "statePageUrl": state_url, "status": "no_2026_27_section"}
    section = section_match.group("content")
    reports = []
    for li in re.findall(r"<li\b[^>]*>(.*?)</li>", section, re.I | re.S):
        heading_match = re.search(r"<h5[^>]*>(.*?)</h5>", li, re.I | re.S)
        if not heading_match:
            continue
        heading = re.sub(r"<[^>]+>", " ", heading_match.group(1))
        heading = re.sub(r"\s+", " ", html.unescape(heading)).strip()
        month_match = MONTH_RE.match(heading)
        if not month_match:
            continue
        pdf_match = re.search(r'href=["\']([^"\']+\.pdf(?:\?[^"\']*)?)["\']', li, re.I)
        if not pdf_match:
            continue
        month_name, year = month_match.groups()
        fiscal_month = MONTHS[month_name]
        if int(year) != (2026 if fiscal_month >= 4 else 2027):
            continue
        # Within FY2026-27, April 2026 is month 1 and January 2027 is month 10.
        fiscal_index = fiscal_month - 3 if fiscal_month >= 4 else fiscal_month + 9
        reports.append(
            {
                "state": state,
                "month": month_name,
                "year": int(year),
                "fiscalMonthIndex": fiscal_index,
                "sourceUrl": html.unescape(pdf_match.group(1)),
                "statePageUrl": state_url,
                "reportType": "CAG Monthly Key Indicators",
            }
        )
    if not reports:
        return {"state": state, "statePageUrl": state_url, "status": "no_2026_27_pdf_listed"}
    reports.sort(key=lambda r: r["fiscalMonthIndex"], reverse=True)
    latest = reports[0]
    latest["fallbackReports"] = reports[1:]
    return latest


def alternate_state_page(state):
    slug = STATE_SUBSITE_SLUGS.get(state)
    if not slug:
        return None
    return f"https://cag.gov.in/ae/{slug}/en/state-accounts-report?defuat_account_report_type=360"


def collect(limit=20, workers=4):
    if not 1 <= limit <= 20:
        raise ValueError("Limit must be 1..20 reports per run")
    if not 1 <= workers <= 4:
        raise ValueError("Use 1..4 concurrent official-page requests")
    index_html = read_url(INDEX_URL).decode("utf-8", "replace")
    pages = state_pages(index_html)
    old = (
        json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {"reports": [], "pageStatus": {}}
    )
    report_by_state = {
        r["state"]: r
        for r in old["reports"]
        if r.get("downloadStatus") in {"downloaded", "downloaded_private_unreviewed"}
    }
    pending_states = [name for name in sorted(STATES) if name not in report_by_state]
    page_results = {}
    page_errors = {}
    with ThreadPoolExecutor(max_workers=workers) as pool:
        future_to_state = {pool.submit(read_url, pages[name]): name for name in pending_states}
        for future in as_completed(future_to_state):
            name = future_to_state[future]
            try:
                page_results[name] = future.result().decode("utf-8", "replace")
            except Exception as exc:
                page_errors[name] = f"{type(exc).__name__}: {exc}"
    candidates = []
    page_status = old.get("pageStatus", {})
    for name in pending_states:
        if name in page_errors:
            page_status[name] = {
                "status": "page_fetch_failed",
                "error": page_errors[name],
                "checkedOn": datetime.now(timezone.utc).date().isoformat(),
            }
            continue
        candidate = latest_report(name, pages[name], page_results[name])
        alternate_url = alternate_state_page(name)
        if alternate_url:
            try:
                alternate_html = read_url(alternate_url).decode("utf-8", "replace")
                alternate = latest_report(name, alternate_url, alternate_html)
                if alternate.get("sourceUrl") and name in {
                    "Andhra Pradesh",
                    "Manipur",
                    "Telangana",
                }:
                    alternate["routeType"] = "official_accountant_general_subsite"
                    candidate = alternate
            except Exception as exc:
                page_status[name] = {
                    "status": "alternate_state_page_failed",
                    "error": f"{type(exc).__name__}: {exc}",
                    "checkedOn": datetime.now(timezone.utc).date().isoformat(),
                }
        if candidate.get("sourceUrl"):
            candidates.append(candidate)
            page_status[name] = {
                "status": "report_found",
                "month": candidate["month"],
                "year": candidate["year"],
                "checkedOn": datetime.now(timezone.utc).date().isoformat(),
            }
        else:
            page_status[name] = {
                "status": candidate["status"],
                "checkedOn": datetime.now(timezone.utc).date().isoformat(),
            }
    # Stable order makes each bounded run resume at the next state.
    candidates.sort(key=lambda r: r["state"])
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for candidate in candidates[:limit]:
        choices = [candidate, *candidate.pop("fallbackReports", [])]
        attempts = []
        selected = None
        for choice in choices:
            url = urllib.parse.urljoin(INDEX_URL, choice["sourceUrl"])
            try:
                body = read_url(url)
                if not body.startswith(b"%PDF-"):
                    raise ValueError("CAG download did not return a PDF")
                slug = re.sub(r"[^a-z0-9]+", "-", choice["state"].lower()).strip("-")
                filename = f"cag-mki-{slug}-2026-27-{choice['year']}-{choice['month'].lower()}.pdf"
                path = ORIGINALS / filename
                path.write_bytes(body)
                choice.update(
                    {
                        "sourceUrl": url,
                        "originalPath": str(path.relative_to(ROOT)),
                        "sha256": hashlib.sha256(body).hexdigest(),
                        "bytes": len(body),
                        "downloadedOn": datetime.now(timezone.utc).date().isoformat(),
                        "downloadStatus": "downloaded_private_unreviewed",
                        "amountsNormalized": False,
                        "developmentClassified": False,
                        "projectPaymentEvidence": False,
                        "publicationApproved": False,
                    }
                )
                selected = choice
                break
            except Exception as exc:
                attempts.append(
                    {
                        "month": choice.get("month"),
                        "sourceUrl": url,
                        "error": f"{type(exc).__name__}: {exc}",
                    }
                )
        if selected:
            selected["earlierReportAttempts"] = attempts
            report_by_state[selected["state"]] = selected
            downloaded.append(selected)
        else:
            candidate.update({"downloadStatus": "download_failed", "attempts": attempts})
            report_by_state[candidate["state"]] = candidate
        time.sleep(0.15)
    result = {
        "source": "Comptroller and Auditor General of India, State Accounts Report",
        "sourceUrl": INDEX_URL,
        "editionScope": "Latest listed 2026–27 Monthly Key Indicators PDF by state; state aggregate accounts only",
        "stateCount": len(STATES),
        "downloadedCount": sum(
            1
            for r in report_by_state.values()
            if r.get("downloadStatus") == "downloaded_private_unreviewed"
        ),
        "remainingCandidateCount": sum(1 for r in candidates[limit:]),
        "lastCheckedOn": datetime.now(timezone.utc).date().isoformat(),
        "pageStatus": page_status,
        "reports": sorted(report_by_state.values(), key=lambda r: r["state"]),
        "limitations": [
            "CAG Monthly Key Indicators are broad accounts, not development-only expenditure or project-level bills.",
            "Monthly values may be cumulative or provisional; do not add different months together.",
            "A report does not identify recipients, contract allocations, asset locations, completion, or bank settlement.",
            "Private originals and parsed values remain unpublished until source, meaning, and reuse review.",
        ],
    }
    BASE.mkdir(parents=True, exist_ok=True)
    MANIFEST.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return {
        "states": len(STATES),
        "downloadedThisRun": len(downloaded),
        "downloadedTotal": result["downloadedCount"],
        "pageFailures": len(page_errors),
        "candidateRemaining": result["remainingCandidateCount"],
        "reports": downloaded,
    }


if __name__ == "__main__":
    print(json.dumps(collect(), ensure_ascii=False))
