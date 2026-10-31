"""Bounded PIB funding intake. Originals and candidate facts only; never publishes."""

import hashlib, json, re, subprocess
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from ingest import ROOT, DATA, ACQUISITION, atomic_json, now
from funding_atlas import STATE_NAMES, exact_rupees

VERSION = "pib-disaster-funding-v1"
POLICY = "https://www.pib.gov.in/content/3604_2_CopyrightPolicy.aspx?lang=1&reg=3"
SOURCES = {
    "2294241": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2294241&lang=1&reg=1",
    "2287315": "https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2287315&lang=2&reg=48",
    "rights": POLICY,
}


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None
        self.text = []

    def handle_starttag(self, t, a):
        if t == "table":
            self.table = []
        if t == "tr" and self.table is not None:
            self.row = []
        if t in ("td", "th") and self.row is not None:
            self.cell = []

    def handle_data(self, d):
        self.text.append(d)
        if self.cell is not None:
            self.cell.append(d)

    def handle_endtag(self, t):
        if t in ("td", "th") and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if t == "tr" and self.row is not None:
            self.table.append(self.row)
            self.row = None
        if t == "table" and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def fetch(key):
    url = SOURCES[key]
    checkpoint = ACQUISITION / "funding-checkpoints" / hashlib.sha256(url.encode()).hexdigest()
    if checkpoint.exists():
        m = json.loads(checkpoint.read_text())
        raw = (ROOT / m["original"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != m["sha256"]:
            raise ValueError("Original checksum changed")
        return raw, m
    target = ROOT / "tmp/funding" / ("pib-" + key + ".html")
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        subprocess.run(
            [
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--max-time",
                "55",
                "--max-filesize",
                "5000000",
                url,
                "-o",
                str(target),
            ],
            check=True,
            capture_output=True,
        )
    raw = target.read_bytes()
    p = Tables()
    p.feed(raw.decode("utf8"))
    text = " ".join(p.text)
    required = (
        "no need for any prior approval"
        if key == "rights"
        else "FINANCIAL ASSISTANCE FOR NATURAL DISASTERS"
        if key == "2294241"
        else "Central Share Rs.4288.50 crore"
    )
    if required not in text:
        raise ValueError("Observed source or policy changed")
    digest = hashlib.sha256(raw).hexdigest()
    path = DATA / "originals" / "funding-atlas" / digest
    path.parent.mkdir(parents=True, exist_ok=True)
    path.parent.chmod(0o700)
    path.write_bytes(raw)
    path.chmod(0o600)
    m = {
        "sourceId": "pib-funding-originals",
        "sourceName": "Press Information Bureau — Union funding releases",
        "sourceFamily": "union_funding",
        "url": url,
        "contextUrl": url,
        "sha256": digest,
        "original": str(path.relative_to(ROOT)),
        "retrievedAt": now(),
        "parserVersion": VERSION,
        "permissionStatus": "explicit_policy_owner_review_pending",
        "permission": "PIB permits accurate attributed reuse without prior approval; third-party exclusions must be checked. Policy: "
        + POLICY,
        "contentType": "text/html",
    }
    atomic_json(checkpoint, m)
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", m)
    return raw, m


def fact(m, release, year, name, code, fund, measure, token, locator, notes="", share="union"):
    fy = f"{year}-{year + 1}"
    identity = f"{fund}:{code}:{fy}:{measure}"
    date = "2026-08-04" if release == "2294241" else "2026-07-21"
    return {
        "id": f"pib-{release}:" + identity,
        "identity": identity,
        "edition": f"PIB release {release} / {date}",
        "financialYear": fy,
        "programmeId": fund,
        "programme": "State Disaster Response Fund"
        if fund == "SDRF"
        else "National Disaster Response Fund",
        "budgetHead": fund,
        "ministry": "Ministry of Home Affairs / PIB"
        if release == "2294241"
        else "Ministry of Agriculture and Farmers Welfare / PIB",
        "jurisdiction": code,
        "jurisdictionLabel": name,
        "purpose": "disaster_response",
        "channel": "disaster_grant",
        "instrument": "grant",
        "measure": measure,
        "estimate": "original" if measure == "allocated" else "not_applicable",
        "accountingBasis": "union_budget" if measure == "allocated" else "union_release",
        "share": share,
        "amountRupees": exact_rupees(token),
        "periodStart": f"{year}-04-01",
        "periodEnd": f"{year + 1}-03-31",
        "cutoff": date,
        "publicationDate": date,
        "coverageKey": identity,
        "aggregation": "leaf",
        "parentKey": None,
        "classification": "awaiting_review",
        "conflict": False,
        "source": {
            "hash": m["sha256"],
            "url": m["url"],
            "locator": locator + "; source unit crore; token " + token,
            "retrievedAt": m["retrievedAt"],
            "page": None,
        },
        "notes": notes
        + " Official Union funding evidence; not recipient utilisation or contractor payments. SDRF covers multiple notified disasters, not only floods. PIB attribution required. Scope is partial.",
    }


def parse_all_states(raw, m):
    p = Tables()
    p.feed(raw.decode("utf8"))
    indices = [
        i
        for i, t in enumerate(p.tables)
        if t
        and len(t[0]) == 5
        and t[0][2] == "Allocation under SDRF including Centre and State share"
    ]
    if len(indices) != 2:
        raise ValueError("Expected original and mirrored Annexure II")
    first = p.tables[indices[0]][2:] + p.tables[indices[0] + 1]
    mirror = p.tables[indices[1]][2:] + p.tables[indices[1] + 1]
    if first != mirror:
        raise ValueError("Visible and duplicated source editions disagree")
    rows = first[:-1]
    totals = first[-1]
    if len(rows) != 28 or totals[0] != "Total" or len(totals) != 10:
        raise ValueError("Complete 28-row annexure required")
    # Dashes remain unknown facts. Summation checks numeric entries only, not a dash-to-zero conversion.
    conflicts = []
    computed = []
    for col in range(9):
        numeric = [
            Decimal(row[col + 2].replace(",", ""))
            for row in rows
            if not re.fullmatch("-+", row[col + 2])
        ]
        computed.append(str(sum(numeric)))
        if sum(numeric) != Decimal(totals[col + 1]):
            conflicts.append(col)
    out = []
    for serial, row in enumerate(rows, 1):
        if len(row) != 11 or int(row[0].rstrip(".")) != serial:
            raise ValueError("State identity sequence changed")
        name = row[1]
        code = STATE_NAMES.get(name)
        if code is None:
            raise ValueError("Unknown state " + name)
        if code.startswith("historical:"):
            raise ValueError("Historical jurisdiction needs explicit assessment")
        for group, (fund, measure, share) in enumerate(
            [
                ("SDRF", "allocated", "combined"),
                ("SDRF", "released", "union"),
                ("NDRF", "released", "union"),
            ]
        ):
            for j, year in enumerate(range(2023, 2026)):
                token = row[2 + group * 3 + j]
                notes = "Annexure II reports financial-year totals, published 4 August 2026; individual release dates are not supplied."
                if share == "combined":
                    notes += " Combined Centre/state allocation stays outside Union totals."
                if re.fullmatch("-+", token):
                    notes += " Source dash has no zero definition; amount remains unknown."
                r = fact(
                    m,
                    "2294241",
                    year,
                    name,
                    code,
                    fund,
                    measure,
                    token,
                    f"Annexure II, state row {serial}, {fund} {measure}, FY {year}-{str(year + 1)[2:]}",
                    notes,
                    share,
                )
                if group * 3 + j in conflicts:
                    r["conflict"] = True
                    r["notes"] += (
                        " Published aggregate differs from the sum of printed state rows; this entire column is withheld pending clarification."
                    )
                if code == "27" and fund == "NDRF" and year in (2024, 2025):
                    r["conflict"] = True
                    r["notes"] += (
                        " PIB 2287315 identifies these amounts as fire-service modernisation, while this annexure labels NDRF for calamities; purpose requires reconciliation."
                    )
                out.append(r)
    return out, {
        "states": 28,
        "columnsReconciled": 9 - len(conflicts),
        "reportedTotalsCrore": totals[1:],
        "computedNumericSumsCrore": computed,
        "conflictingColumnsOneBased": [i + 1 for i in conflicts],
        "mirroredTableDeduplicated": True,
    }


def parse_maharashtra(raw, m):
    p = Tables()
    p.feed(raw.decode("utf8"))
    tables = [
        t
        for t in p.tables
        if t
        and t[0]
        == [
            "Financial Year",
            "Allocation under SDRF",
            "Release of Central Share under SDRF",
            "Release under NDRF",
        ]
    ]
    if len(tables) != 2 or tables[0] != tables[1]:
        raise ValueError("Maharashtra headers or mirrored tables changed")
    out = [
        fact(
            m,
            "2287315",
            2026,
            "Maharashtra",
            "27",
            "SDRF",
            "allocated",
            "4288.50",
            "Opening explicit FY 2026–27 Central share paragraph",
            "Source independently distinguishes Union ₹4,288.50 crore and state ₹1,429.50 crore, combined ₹5,718 crore. Accepted 16FC Union allocation column agrees exactly; this is an allocation, not released money.",
        )
    ]
    if Decimal("4288.50") + Decimal("1429.50") != Decimal("5718.00"):
        raise ValueError("Share reconciliation failed")
    for row in tables[0][2:]:
        if len(row) != 5 or not re.fullmatch("202[1-5]-2[2-6]", row[0]):
            raise ValueError("Maharashtra fiscal rows changed")
        year = int(row[0][:4])
        out.append(
            fact(
                m,
                "2287315",
                year,
                "Maharashtra",
                "27",
                "SDRF",
                "allocated",
                row[1],
                "First table, " + row[0] + ", explicit Central Share allocation column",
            )
        )
        # Later all-state edition covers 2023–25 releases. Preserve but flag these overlapping older editions.
        r = fact(
            m,
            "2287315",
            year,
            "Maharashtra",
            "27",
            "SDRF",
            "released",
            row[3],
            "First table, " + row[0] + ", Release of Central Share under SDRF column",
        )
        if year >= 2023:
            r["conflict"] = True
            r["notes"] += (
                " Superseded for review by PIB 2294241, 4 August 2026 full-year annexure. Do not publish both editions."
            )
        out.append(r)
        if year == 2021:
            out.append(
                fact(
                    m,
                    "2287315",
                    year,
                    "Maharashtra",
                    "27",
                    "NDRF",
                    "released",
                    row[4],
                    "First table, 2021–22, NDRF release column",
                )
            )
    return out


def main():
    _, policy = fetch("rights")
    raw, all_manifest = fetch("2294241")
    records, reconciliation = parse_all_states(raw, all_manifest)
    raw, maha_manifest = fetch("2287315")
    records += parse_maharashtra(raw, maha_manifest)
    path = ACQUISITION / "funding-records.json"
    existing = json.loads(path.read_text())
    old = {r["id"]: r for r in existing["records"]}
    for record in records:
        if record["id"] in old and old[record["id"]] != record:
            raise ValueError("Immutable parser edition conflict")
        old[record["id"]] = record
    existing["records"] = list(old.values())
    atomic_json(path, existing)
    reviewable = [
        r
        for r in records
        if r["share"] == "union" and r["amountRupees"] is not None and not r["conflict"]
    ]
    packet = {
        "parserVersion": VERSION,
        "recordIds": [r["id"] for r in records],
        "reviewableIds": [r["id"] for r in reviewable],
        "policy": policy,
        "originals": [all_manifest, maha_manifest],
        "reconciliation": reconciliation,
        "reviewStatus": "source_and_fact_checks_prepared_owner_mfa_pending",
        "publication": "private_only",
        "rightsBasis": "PIB own Ministry press releases, no third-party copyright designation observed. Accurate attributed reuse permitted by preserved PIB policy. No Union Budget or MHA original permission is inferred.",
    }
    review_path = ACQUISITION / "funding-pib-review.json"
    if review_path.exists():
        prior = json.loads(review_path.read_text())
        if (
            prior.get("recordIds") == packet["recordIds"]
            and prior.get("reviewableIds") == packet["reviewableIds"]
        ):
            for key in ("reviewStatus", "publication", "publicationCheckpoint"):
                if key in prior:
                    packet[key] = prior[key]
    atomic_json(review_path, packet)
    review_path.chmod(0o600)
    print(
        json.dumps(
            {
                "privateCandidates": len(records),
                "reviewableCandidates": len(reviewable),
                "reconciledStates": 28,
                "publicationsWritten": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
