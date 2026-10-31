"""Checkpointed private Funding Atlas acquisition. No publication or guessed state splits."""

import argparse, hashlib, json, re, subprocess, time
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse
from decimal import Decimal
from pypdf import PdfReader
from ingest import ROOT, DATA, ACQUISITION, atomic_json, now

VERSION = "funding-atlas-inventory-v1"


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.href = None
        self.text = []

    def handle_starttag(self, t, a):
        if t == "a":
            self.href = dict(a).get("href")
            self.text = []

    def handle_data(self, d):
        if self.href:
            self.text.append(d)

    def handle_endtag(self, t):
        if t == "a" and self.href:
            self.links.append((" ".join("".join(self.text).split()), self.href))
            self.href = None


def fetch(url, limit=50000000):
    if urlparse(url).scheme != "https" or urlparse(url).hostname not in (
        "www.indiabudget.gov.in",
        "www.mha.gov.in",
        "surveyofindia.gov.in",
    ):
        raise ValueError("Source outside acquisition allowlist")
    cache = ACQUISITION / "funding-checkpoints" / hashlib.sha256(url.encode()).hexdigest()
    cache.parent.mkdir(parents=True, exist_ok=True)
    if cache.exists():
        m = json.loads(cache.read_text())
        raw = (ROOT / m["original"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != m["sha256"]:
            raise ValueError("Checkpoint checksum mismatch")
        return raw, m
    temp = cache.with_suffix(".download")
    r = subprocess.run(
        [
            "curl",
            "--fail",
            "--silent",
            "--show-error",
            "--location",
            "--max-time",
            "55",
            "--max-filesize",
            str(limit),
            url,
            "-o",
            str(temp),
        ],
        capture_output=True,
    )
    if r.returncode:
        temp.unlink(missing_ok=True)
        raise ValueError("Source download unavailable")
    raw = temp.read_bytes()
    temp.unlink()
    digest = hashlib.sha256(raw).hexdigest()
    path = DATA / "originals" / "funding-atlas" / digest
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.write_bytes(raw)
    path.chmod(0o600)
    m = {
        "sourceId": "funding-atlas-originals",
        "sourceName": "Official Union funding originals",
        "sourceFamily": "union_funding",
        "url": url,
        "contextUrl": url,
        "sha256": digest,
        "original": str(path.relative_to(ROOT)),
        "retrievedAt": now(),
        "parserVersion": VERSION,
        "permissionStatus": "permission_review_pending",
        "permission": "Private collection. Source-specific reuse review required.",
        "contentType": "application/pdf"
        if raw.startswith(b"%PDF-")
        else "text/html"
        if raw.lstrip().startswith(b"<")
        else "application/octet-stream",
    }
    atomic_json(cache, m)
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", m)
    time.sleep(0.15)
    return raw, m


def links(url):
    raw, m = fetch(url)
    p = Links()
    p.feed(raw.decode("utf-8", errors="replace"))
    return [(text, urljoin(url, href)) for text, href in p.links], m


def inventory_pdf(raw, manifest, edition):
    from io import BytesIO

    reader = PdfReader(BytesIO(raw))
    demands = {}
    rows = []
    number = None
    department = None
    for page_number, page in enumerate(reader.pages, 1):
        text = page.extract_text()
        ident = re.search(r"\bDEMAND\s+NO\.\s*(\d+)\b", text, re.I) or re.search(
            r"No\.\s*(\d+)\s*\(APPROPRIATION\)", text, re.I
        )
        if ident:
            number = int(ident[1])
            demands.setdefault(
                number,
                {
                    "number": number,
                    "firstPage": page_number,
                    "status": "awaiting_review",
                    "reconciliation": "not_completed",
                },
            )
        # Preserve every nonblank row, including hierarchy, recovery and contextual totals.
        # This is a row inventory, not a claim that each line is a separately additive programme.
        for line_number, line in enumerate(text.splitlines(), 1):
            if not line.strip():
                continue
            if re.search(r"(?:\d+[,.]\d+|\.\.\.)", line):
                rows.append(
                    {
                        "id": f"{manifest['sha256']}:{page_number}:{line_number}",
                        "demandNumber": number,
                        "edition": edition,
                        "page": page_number,
                        "line": line_number,
                        "rawText": line.strip(),
                        "classification": "awaiting_review",
                        "aggregation": "unresolved",
                        "unit": "source_header_review_required",
                        "financialColumns": "source_header_review_required",
                        "sourceHash": manifest["sha256"],
                        "sourceUrl": manifest["url"],
                    }
                )
    return {
        "edition": edition,
        "source": manifest,
        "demands": list(demands.values()),
        "rows": rows,
        "pages": len(reader.pages),
        "classificationCounts": {
            "included": 0,
            "excluded": 0,
            "mixed_unresolved": 0,
            "awaiting_review": len(rows),
        },
        "reconciled": False,
    }


def budget_inventory():
    archive, _ = links("https://www.indiabudget.gov.in/previous_union_budget.php")
    annual = {}
    for label, url in archive:
        match = re.fullmatch(r"(20\d{2})-(20\d{2})", label)
        if match and 2016 <= int(match[1]) <= 2025:
            annual[int(match[1])] = url
    annual[2026] = "https://www.indiabudget.gov.in/"
    ledger = []
    for start in range(2016, 2027):
        fy = f"{start}-{start + 1}"
        entry = {
            "financialYear": fy,
            "demands": 0,
            "lines": 0,
            "status": "awaiting_acquisition",
            "reconciled": False,
        }
        try:
            if start not in annual:
                raise ValueError("Annual edition link absent")
            page_links, _ = links(annual[start])
            documents = [
                (t, u) for t, u in page_links if u.rsplit("/", 1)[-1] in ("allsbe.pdf", "vol2.pdf")
            ]
            if not documents:
                expenditure = next(
                    (
                        u
                        for t, u in page_links
                        if t.strip().startswith("Expenditure Budget")
                        and u.endswith((".asp", ".php"))
                    ),
                    None,
                )
                if expenditure:
                    el, _ = links(expenditure)
                    v2 = next(
                        (u for t, u in el if "Volume II" in t or u.endswith("vol2.asp")), None
                    )
                    if not v2:
                        nested = next(
                            (u for t, u in el if u.endswith("expenditure_budget.php")), None
                        )
                        if nested:
                            el, _ = links(nested)
                    if not v2:
                        documents = [
                            (t, u)
                            for t, u in el
                            if u.rsplit("/", 1)[-1] in ("allsbe.pdf", "vol2.pdf")
                        ]
                    if v2:
                        vl, _ = links(v2)
                        documents = [
                            (t, u)
                            for t, u in vl
                            if u.rsplit("/", 1)[-1] in ("allsbe.pdf", "vol2.pdf")
                        ]
            if not documents:
                raise ValueError("Combined expenditure PDF not linked in assessed index")
            url = documents[0][1]
            raw, m = fetch(url)
            if not raw.startswith(b"%PDF-"):
                raise ValueError("PDF original required")
            out = ACQUISITION / "funding-inventory" / f"{fy}.json"
            if (
                out.exists()
                and json.loads(out.read_text()).get("source", {}).get("sha256") == m["sha256"]
            ):
                result = json.loads(out.read_text())
            else:
                result = inventory_pdf(raw, m, fy)
                atomic_json(out, result)
            if not result["demands"]:
                raise ValueError("PDF does not establish an expenditure-demand edition")
            entry.update(
                demands=len(result["demands"]),
                lines=len(result["rows"]),
                pages=result["pages"],
                status="private_classification_and_reconciliation_pending",
                sourceUrl=url,
                sha256=m["sha256"],
            )
        except Exception as e:
            entry.update(status="source_or_parser_assistance_needed", gap=str(e)[:180])
        ledger.append(entry)
        update_ledger(ledger)
        print(json.dumps(entry), flush=True)


STATE_NAMES = {
    "Andhra Pr.": "28",
    "Andhra Pradesh": "28",
    "Arunachal Pr.": "12",
    "Arunachal Pradesh": "12",
    "Assam": "18",
    "Bihar": "10",
    "Chhattisgarh": "22",
    "Goa": "30",
    "Gujarat": "24",
    "Haryana": "6",
    "Himachal Pr.": "2",
    "Himachal Pradesh": "2",
    "Jharkhand": "20",
    "Karnataka": "29",
    "Kerala": "32",
    "Madhya Pr.": "23",
    "Madhya Pradesh": "23",
    "Maharashtra": "27",
    "Manipur": "14",
    "Meghalaya": "17",
    "Mizoram": "15",
    "Nagaland": "13",
    "Odisha": "21",
    "Punjab": "3",
    "Rajasthan": "8",
    "Sikkim": "11",
    "Tamil Nadu": "33",
    "Telangana": "36",
    "Tripura": "16",
    "Uttar Pr.": "9",
    "Uttar Pradesh": "9",
    "Uttarakhand": "5",
    "West Bengal": "19",
    "Jammu & Kashmir": "historical:jammu_kashmir_combined",
}


def exact_rupees(token):
    token = token.replace(",", "").rstrip("#*@")
    if token == "..." or re.fullmatch(r"-+", token):
        return None
    d = Decimal(token) * Decimal(10000000)
    if not d.is_finite() or d != d.quantize(Decimal(".01")):
        raise ValueError("Amount not exact to paise")
    return format(d, ".2f")


def disaster_records():
    # Source 1408 provides all years; 1538 preserves an independent, sometimes conflicting edition.
    records = []
    quarantine = []
    for question in (1408, 1538):
        url = f"https://www.mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/LS09122025/{question}.pdf"
        raw, m = fetch(url)
        from io import BytesIO

        reader = PdfReader(BytesIO(raw))
        for index, page in enumerate(reader.pages):
            if question == 1408:
                years = (
                    list(range(2014, 2019))
                    if index == 3
                    else list(range(2019, 2024))
                    if index == 4
                    else [2024, 2025]
                    if index == 5
                    else []
                )
            else:
                years = list(range(2020, 2025)) if index in (2, 3) else []
            if not years:
                continue
            text = page.extract_text(extraction_mode="layout")
            n = len(years)
            for line in text.splitlines():
                match = re.match(r"^\s*(\d+)\.?\s+(.+?)\s{2,}(.+?)\s*$", line)
                if not match:
                    continue
                name = match[2].strip()
                tokens = match[3].split()
                code = STATE_NAMES.get(name)
                if not code or len(tokens) != n * 3:
                    quarantine.append(
                        {
                            "question": question,
                            "page": index + 1,
                            "reason": "Unknown identity or changed financial columns",
                            "rawText": line.strip(),
                        }
                    )
                    continue
                for col, (fund, measure, share, basis) in enumerate(
                    [
                        ("SDRF", "allocated", "combined", "union_budget"),
                        ("SDRF", "released", "union", "union_release"),
                        ("NDRF", "released", "union", "union_release"),
                    ]
                ):
                    for j, start in enumerate(years):
                        if start < 2016:
                            continue
                        token = tokens[col * n + j]
                        try:
                            rupees = exact_rupees(token)
                        except Exception:
                            quarantine.append(
                                {
                                    "question": question,
                                    "page": index + 1,
                                    "reason": "Amount notation unresolved",
                                    "rawText": line.strip(),
                                }
                            )
                            continue
                        fy = f"{start}-{start + 1}"
                        identity = f"{fund}:{code}:{fy}:{measure}"
                        rid = f"mha-ls-{question}-20251209:{identity}"
                        # Arrears included in releases; the reported year is not assumed to be the allocation year.
                        notes = "All notified calamities; not flood-specific. Releases do not prove recipient use or contractor payment."
                        if share == "combined":
                            notes += " Allocation includes Centre and State shares; excluded from Union-only totals until an official Union split is documented."
                        if rupees is None:
                            notes += " Dash is not interpreted as zero without a source definition."
                        if "#" in token:
                            notes += " Source footnote includes arrears of previous-year SDRF."
                        if question == 1408 and index == 4 and col == 1 and j == 4:
                            notes += " Printed header says 2024-23; year attribution requires clarification."
                        cutoff = "2025-12-09" if start == 2025 else f"{start + 1}-03-31"
                        if (
                            question == 1408
                            and index == 3
                            and measure == "released"
                            and fund == "SDRF"
                            and start == 2017
                        ):
                            cutoff = "2018-03-13"
                            notes += " Header cutoff is 13 March 2018."
                        records.append(
                            {
                                "id": rid,
                                "identity": identity,
                                "edition": f"Lok Sabha answer {question} / 9 December 2025",
                                "financialYear": fy,
                                "programmeId": fund,
                                "programme": "State Disaster Response Fund"
                                if fund == "SDRF"
                                else "National Disaster Response Fund",
                                "budgetHead": fund,
                                "ministry": "Ministry of Home Affairs",
                                "jurisdiction": code,
                                "jurisdictionLabel": name,
                                "purpose": "disaster_response",
                                "channel": "disaster_grant",
                                "instrument": "grant",
                                "measure": measure,
                                "estimate": "original"
                                if measure == "allocated"
                                else "not_applicable",
                                "accountingBasis": basis,
                                "share": share,
                                "amountRupees": rupees,
                                "periodStart": f"{start}-04-01",
                                "periodEnd": min(f"{start + 1}-03-31", cutoff),
                                "cutoff": cutoff,
                                "publicationDate": "2025-12-09",
                                "coverageKey": identity,
                                "aggregation": "leaf",
                                "parentKey": None,
                                "classification": "awaiting_review",
                                "conflict": question == 1408 and index == 4 and col == 1 and j == 4,
                                "source": {
                                    "hash": m["sha256"],
                                    "url": url,
                                    "locator": f"Lok Sabha Q{question}, annexure page {index + 1}, state row {match[1]}, {fund} {measure} {start}-{str(start + 1)[2:]}; source unit crore; token {token}",
                                    "retrievedAt": m["retrievedAt"],
                                    "page": index + 1,
                                },
                                "notes": notes,
                            }
                        )
    records.extend(fc16_allocations())
    # Refresh this parser's editions without discarding separately acquired annexures.
    existing_path = ACQUISITION / "funding-records.json"
    if existing_path.exists():
        existing = json.loads(existing_path.read_text())
        records += [r for r in existing["records"] if r["id"].startswith("mha-ls-348-20251202:")]
        quarantine += [r for r in existing["quarantine"] if r.get("question") == 348]
    atomic_json(
        existing_path,
        {
            "records": records,
            "quarantine": quarantine,
            "parserVersion": VERSION,
            "publication": "private_only",
        },
    )
    update_ledger(disaster_count=len(records), disaster_quarantine=len(quarantine))
    print(
        json.dumps(
            {
                "disasterFacts": len(records),
                "quarantinedRows": len(quarantine),
                "unionAllocationFacts": sum(
                    1 for r in records if r["measure"] == "allocated" and r["share"] == "union"
                ),
            }
        ),
        flush=True,
    )


def fc16_allocations():
    from io import BytesIO

    raw, m = fetch("https://www.indiabudget.gov.in/doc/16fcvol2.pdf")
    acceptance, am = fetch("https://www.indiabudget.gov.in/doc/16fc.pdf")
    reader = PdfReader(BytesIO(raw))
    out = []
    acceptance_text = "\n".join(
        p.extract_text() for p in PdfReader(BytesIO(acceptance)).pages[9:12]
    )
    if (
        "Financing of Disaster Management" not in acceptance_text
        or "The Government has accepted the above recommendations" not in acceptance_text
    ):
        raise ValueError("Government acceptance text changed")
    for index, fund, purpose in [
        (69, "SDRF", "disaster_response"),
        (70, "SDMF", "disaster_mitigation"),
    ]:
        text = reader.pages[index].extract_text()
        if "Union and State Share of " + fund not in text:
            raise ValueError("Union-share annexure locator changed")
        rows = []
        totals = None
        for line in text.splitlines():
            match = re.match(r"^(.+?)\s{2,}([0-9,.]+(?:\s+[0-9,.]+){11})\s*$", line)
            if not match:
                continue
            name = match[1].strip()
            values = match[2].split()
            if name == "Total":
                totals = [Decimal(v.replace(",", "")) for v in values]
                continue
            code = STATE_NAMES.get(name)
            if not code:
                raise ValueError("Unmapped Finance Commission state: " + name)
            amounts = [Decimal(v.replace(",", "")) for v in values]
            if sum(amounts[:5]) != amounts[5] or sum(amounts[6:11]) != amounts[11]:
                raise ValueError("Annual shares do not reconcile")
            rows.append((name, code, amounts, values))
        if (
            len(rows) != 28
            or totals is None
            or any(sum(r[2][i] for r in rows) != totals[i] for i in range(12))
        ):
            raise ValueError("State/Union share table totals do not reconcile")
        for name, code, amounts, tokens in rows:
            # New J&K is the UT shown by this edition, not the historical undivided state.
            if code.startswith("historical:"):
                code = "1"
            identity = f"{fund}:{code}:2026-2027:allocated"
            out.append(
                {
                    "id": "fc16-20260201:" + identity,
                    "identity": identity,
                    "edition": "16th Finance Commission, Government-accepted recommendations, 1 February 2026",
                    "financialYear": "2026-2027",
                    "programmeId": fund,
                    "programme": "State Disaster Response Fund"
                    if fund == "SDRF"
                    else "State Disaster Mitigation Fund",
                    "budgetHead": fund,
                    "ministry": "Ministry of Home Affairs / Finance Commission",
                    "jurisdiction": code,
                    "jurisdictionLabel": name,
                    "purpose": purpose,
                    "channel": "disaster_grant",
                    "instrument": "grant",
                    "measure": "allocated",
                    "estimate": "original",
                    "accountingBasis": "union_budget",
                    "share": "union",
                    "amountRupees": exact_rupees(tokens[0]),
                    "periodStart": "2026-04-01",
                    "periodEnd": "2027-03-31",
                    "cutoff": "2026-02-01",
                    "publicationDate": "2026-02-01",
                    "coverageKey": identity,
                    "aggregation": "leaf",
                    "parentKey": None,
                    "classification": "awaiting_review",
                    "conflict": False,
                    "source": {
                        "hash": m["sha256"],
                        "url": m["url"],
                        "locator": f"Volume II, Annexure 11.{5 if fund == 'SDRF' else 6}, PDF page {index + 1}, {name}, 2026-27 Union share column; crore. All 28 state rows and annual/share totals reconciled.",
                        "retrievedAt": m["retrievedAt"],
                        "page": index + 1,
                    },
                    "notes": f"Government accepted recommendations in Explanatory Memorandum https://www.indiabudget.gov.in/doc/16fc.pdf, PDF pages 10–12, paragraphs 20–25; original SHA-256 {am['sha256']}. Accepted allocation, not release or use. Implementation orders and review remain required. "
                    + (
                        "SDRF covers multiple disasters and response/recovery; relief versus reconstruction split is not supplied. Do not call this Bihar flood funding."
                        if fund == "SDRF"
                        else "Disaster mitigation and preparedness; separate from response and rebuilding."
                    ),
                }
            )
    return out


def mitigation_records():
    from io import BytesIO

    url = "https://www.mha.gov.in/MHA1/Par2017/pdfs/par2025-pdfs/LS02122025/348.pdf"
    raw, m = fetch(url)
    text = PdfReader(BytesIO(raw)).pages[7].extract_text(extraction_mode="layout")
    if (
        "Centre’s Share of SDMF Released" not in text
        and "Centre's Share of SDMF Released" not in text
    ):
        raise ValueError("Explicit Union release header required")
    out = []
    quarantine = []
    for line in text.splitlines():
        match = re.match(r"^\s*(\d+)\.?\s+(.+?)\s{2,}(.+?)\s*$", line)
        if not match:
            continue
        name = match[2].strip()
        code = STATE_NAMES.get(name)
        tokens = re.sub(r"\s+#", "#", match[3]).split()
        if not code or len(tokens) != 9:
            quarantine.append(
                {
                    "question": 348,
                    "page": 8,
                    "rawText": line.strip(),
                    "reason": "Changed columns or unknown state identity",
                }
            )
            continue
        # Allocation includes state share, so retain only the explicitly headed release columns.
        for i, start, fund in [
            (3, 2022, "SDMF"),
            (4, 2023, "SDMF"),
            (5, 2024, "SDMF"),
            (6, 2025, "SDMF"),
            (7, 2024, "NDMF"),
            (8, 2025, "NDMF"),
        ]:
            amount = exact_rupees(tokens[i])
            fy = f"{start}-{start + 1}"
            identity = f"{fund}:{code}:{fy}:released"
            cutoff = "2025-12-02" if start == 2025 else f"{start + 1}-03-31"
            notes = "Source heading abbreviations and columns identify SDMF/NDMF, while the annexure caption incorrectly says Response Fund and its date range omits the displayed 2025–26 column. Reconcile this caption/header inconsistency before publication. Releases are not recipient utilisation or contractor settlement."
            if "#" in tokens[i]:
                notes += " Footnote: includes arrears from earlier years; retain the release reporting year."
            if amount is None:
                notes += " Dash remains unknown, not zero."
            out.append(
                {
                    "id": "mha-ls-348-20251202:" + identity,
                    "identity": identity,
                    "edition": "Lok Sabha answer 348 / 2 December 2025",
                    "financialYear": fy,
                    "programmeId": fund,
                    "programme": "State Disaster Mitigation Fund"
                    if fund == "SDMF"
                    else "National Disaster Mitigation Fund",
                    "budgetHead": fund,
                    "ministry": "Ministry of Home Affairs",
                    "jurisdiction": code,
                    "jurisdictionLabel": name,
                    "purpose": "disaster_mitigation",
                    "channel": "disaster_grant",
                    "instrument": "grant",
                    "measure": "released",
                    "estimate": "not_applicable",
                    "accountingBasis": "union_release",
                    "share": "union",
                    "amountRupees": amount,
                    "periodStart": f"{start}-04-01",
                    "periodEnd": min(f"{start + 1}-03-31", cutoff),
                    "cutoff": cutoff,
                    "publicationDate": "2025-12-02",
                    "coverageKey": identity,
                    "aggregation": "leaf",
                    "parentKey": None,
                    "classification": "awaiting_review",
                    "conflict": True,
                    "source": {
                        "hash": m["sha256"],
                        "url": url,
                        "locator": f"Question 348, Annexure III, PDF page 8, state row {match[1]}, {fund} release column {start}-{str(start + 1)[2:]}; original unit crore; token {tokens[i]}",
                        "retrievedAt": m["retrievedAt"],
                        "page": 8,
                    },
                    "notes": notes,
                }
            )
    path = ACQUISITION / "funding-records.json"
    existing = json.loads(path.read_text())
    old = [r for r in existing["records"] if not r["id"].startswith("mha-ls-348-20251202:")]
    existing["records"] = old + out
    existing["quarantine"] = [
        r for r in existing["quarantine"] if r.get("question") != 348
    ] + quarantine
    atomic_json(path, existing)
    update_ledger(
        disaster_count=len(existing["records"]), disaster_quarantine=len(existing["quarantine"])
    )
    print(
        json.dumps(
            {
                "additionalMitigationCandidates": len(out),
                "captionConflictsRetained": True,
                "originalHash": m["sha256"],
            }
        ),
        flush=True,
    )


def update_ledger(editions=None, disaster_count=None, disaster_quarantine=None):
    path = DATA / "funding-acquisition.json"
    old = json.loads(path.read_text()) if path.exists() else {}
    if editions is not None:
        old["editions"] = editions
    if disaster_count is not None:
        old["disasterRecords"] = disaster_count
        old["disasterQuarantinedRows"] = disaster_quarantine
    old.setdefault("boundary", {"status": "soi_reuse_review_pending"})
    old.setdefault("disasterRecords", 0)
    old.update(
        updatedAt=now(),
        complete=False,
        publication="private_evidence_review_pending",
        gaps=[
            "Union Budget republication permission remains pending.",
            "Every inventoried budget row requires development classification and hierarchy reconciliation.",
            "SDRF allocation tables include state share; Union-only allocation needs explicit source evidence.",
            "2026–27 state releases and recipient utilisation are not established by these annexures.",
            "SDMF, NDMF, reconstruction and other programme/year partitions remain in the acquisition queue.",
        ],
    )
    if (ACQUISITION / "funding-records.json").exists():
        facts = json.loads((ACQUISITION / "funding-records.json").read_text())["records"]
        old["disasterConflictRows"] = sum(1 for r in facts if r["conflict"])
        if any(r["id"].startswith("mha-ls-348-20251202:") for r in facts):
            old["gaps"][-1] = (
                "SDMF/NDMF release annexure captions and displayed fiscal years conflict; supplemental facts remain withheld. Reconstruction, recipient utilisation and other programme/year partitions remain in the acquisition queue."
            )
    # Always enumerate all agreed FYs, including those not yet acquired.
    supplied = {e["financialYear"]: e for e in old.get("editions", [])}
    old["editions"] = [
        supplied.get(
            f"{y}-{y + 1}",
            {
                "financialYear": f"{y}-{y + 1}",
                "demands": 0,
                "lines": 0,
                "status": "awaiting_acquisition",
                "reconciled": False,
            },
        )
        for y in range(2016, 2027)
    ]
    atomic_json(path, old)


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("action", choices=["budgets", "disaster", "mitigation", "all"])
    args = p.parse_args()
    if args.action in ("disaster", "all"):
        disaster_records()
    if args.action in ("budgets", "all"):
        budget_inventory()
    if args.action in ("mitigation", "all"):
        mitigation_records()
