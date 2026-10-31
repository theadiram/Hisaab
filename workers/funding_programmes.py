"""Bounded programme funding intake; preserves originals, never publishes.

Known official reports only. Source blanks remain unknown. Rounded aggregate
checks report their precision bound; neither printed parents nor guessed shares
are added to the state rows.
"""

import hashlib, json, re, subprocess
from decimal import Decimal
from io import BytesIO
from pathlib import Path
from pypdf import PdfReader
from funding_pib import Tables, POLICY, fetch as fetch_pib_policy
from funding_atlas import STATE_NAMES
from ingest import ROOT, DATA, ACQUISITION, atomic_json, now

VERSION = "programme-funding-v1"
SOURCES = {
    "2153505": (
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2153505&lang=1&reg=3",
        "SOCIAL DEVELOPMENT AND EMPOWERMENT OF STS",
    ),
    "2153037": (
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2153037&lang=1&reg=3",
        "Central Sector Scheme of Eklavya Model Residential School",
    ),
    "2295018": (
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295018&lang=1&reg=6",
        "Funding pattern in higher education",
    ),
    "2288990": (
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2288990&lang=2&reg=48",
        "Mahatma Gandhi NREGS",
    ),
    "1780140": (
        "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1780140&lang=2&reg=3",
        "Central Releases and Expenditure under National Health Mission",
    ),
    "nhm-2994": (
        "https://sansad.in/getFile/annex/268/AU2994_11hEQ4.pdf?source=pqars",
        "ALLOCATION OF FUND TO STATES UNDER NHM",
    ),
    "sansad-policy": ("https://sansad.in/rs/privacyPolicy", "Copyright Policy"),
}
ALIASES = {
    **STATE_NAMES,
    "Jammu & Kashmir": "1",
    "Jammu and Kashmir": "1",
    "Andaman & Nicobar Islands": "35",
    "Andaman and Nicobar Islands": "35",
    "Delhi": "7",
    "Chandigarh": "4",
    "Ladakh": "37",
    "Lakshadweep": "31",
    "Puducherry": "34",
    "Orissa": "21",
    "Chattisgarh": "22",
    "Dadra & Nagar Haveli and Daman & Diu": "38",
    "The Dadar & Nagar Haveli Daman & Diu": "38",
    "Dadra & Nagar Haveli": "historical:dadra_nagar_haveli",
    "Daman & Diu": "historical:daman_diu",
}
ALIASES.update(
    {
        "Andaman & Nicobar": "35",
        "Dadra & Nagar Haveli And Daman & Diu": "38",
        "Jammu And Kashmir": "1",
    }
)
ALIASES["Dadra & Nagar Haveli Daman & Diu"] = "38"


def acquire(key):
    url, required = SOURCES[key]
    checkpoint = ACQUISITION / "funding-checkpoints" / hashlib.sha256(url.encode()).hexdigest()
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    if checkpoint.exists():
        m = json.loads(checkpoint.read_text())
        raw = (ROOT / m["original"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != m["sha256"]:
            raise ValueError("Original checksum changed")
        return raw, m
    path = (
        ROOT
        / "tmp/funding"
        / (
            "pib-" + key + ".html"
            if key.isdigit()
            else key + (".pdf" if key == "nhm-2994" else ".html")
        )
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        subprocess.run(
            [
                "curl",
                "--fail",
                "--silent",
                "--show-error",
                "--location",
                "--max-time",
                "50",
                "--max-filesize",
                "5000000",
                url,
                "-o",
                str(path),
            ],
            capture_output=True,
            check=True,
        )
    raw = path.read_bytes()
    if key == "nhm-2994":
        text = " ".join(" ".join(p.extract_text() for p in PdfReader(BytesIO(raw)).pages).split())
    else:
        p = Tables()
        p.feed(raw.decode("utf8"))
        text = " ".join(p.text)
    if re.sub(r"\s+", "", required).casefold() not in re.sub(r"\s+", "", text).casefold():
        raise ValueError("Official report changed: " + key)
    digest = hashlib.sha256(raw).hexdigest()
    target = DATA / "originals/funding-atlas" / digest
    target.parent.mkdir(parents=True, exist_ok=True)
    target.parent.chmod(0o700)
    target.write_bytes(raw)
    target.chmod(0o600)
    pib = key.isdigit()
    m = {
        "sourceId": "pib-funding-originals" if pib else "parliament-funding-originals",
        "sourceName": "Press Information Bureau — Union programme funding"
        if pib
        else "Rajya Sabha — Union programme funding",
        "sourceFamily": "union_funding",
        "url": url,
        "contextUrl": url,
        "sha256": digest,
        "original": str(target.relative_to(ROOT)),
        "retrievedAt": now(),
        "parserVersion": VERSION,
        "contentType": "application/pdf" if key == "nhm-2994" else "text/html",
        "permissionStatus": "explicit_policy_owner_review_pending"
        if pib
        else "permission_review_pending",
        "permission": "PIB own Ministry release: attributed reproduction policy must be reviewed against third-party exclusions. "
        + POLICY
        if pib
        else "Private only. Digital Sansad portal requires due reproduction permission; PIB policy does not license this original.",
    }
    atomic_json(checkpoint, m)
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", m)
    return raw, m


def amount(token, unit):
    if not token or re.fullmatch(r"-+", token):
        return None
    clean = token.replace(",", "").rstrip("*")
    d = Decimal(clean) * Decimal(100000 if unit == "lakh" else 10000000)
    if not d.is_finite() or d != d.quantize(Decimal(".01")):
        raise ValueError("Amount not exact to paise")
    return format(d, ".2f")


def state(name, year):
    name = re.sub(r"\s*\(NE\)$", "", " ".join(name.strip().rstrip("*").strip().split())).strip()
    code = ALIASES.get(name)
    if not code:
        raise ValueError("Unassessed jurisdiction: " + name)
    if name in ("Jammu & Kashmir", "Jammu and Kashmir") and year <= 2019:
        code = "historical:jammu_kashmir_combined"
    return code, name


def fact(
    m,
    key,
    year,
    name,
    programme,
    programme_id,
    purpose,
    token,
    unit,
    date,
    locator,
    notes="",
    channel="centrally_sponsored",
    conflict=False,
    period_end=None,
):
    code, label = state(name, year)
    identity = f"{programme_id}:{code}:{year}-{year + 1}:released"
    cutoff = date
    return {
        "id": f"programme-{key}:" + identity,
        "identity": identity,
        "edition": f"Official report {key} / {date}",
        "financialYear": f"{year}-{year + 1}",
        "programmeId": programme_id,
        "programme": programme,
        "budgetHead": programme_id,
        "ministry": "Ministry of Health and Family Welfare"
        if programme_id == "NHM"
        else "Ministry of Education / PIB"
        if programme_id == "RUSA-PMUSHA"
        else "Ministry of Rural Development / PIB"
        if programme_id == "MGNREGS"
        else "Ministry of Tribal Affairs / PIB",
        "jurisdiction": code,
        "jurisdictionLabel": label,
        "purpose": purpose,
        "channel": channel,
        "instrument": "grant",
        "measure": "released",
        "estimate": "not_applicable",
        "accountingBasis": "union_release",
        "share": "union",
        "amountRupees": amount(token, unit),
        "periodStart": f"{year}-04-01",
        "periodEnd": period_end or f"{year + 1}-03-31",
        "cutoff": cutoff,
        "publicationDate": date,
        "coverageKey": identity,
        "aggregation": "leaf",
        "parentKey": None,
        "classification": "awaiting_review",
        "conflict": conflict,
        "source": {
            "hash": m["sha256"],
            "url": m["url"],
            "locator": locator + f"; source unit {unit}; printed token {token or 'blank'}",
            "retrievedAt": m["retrievedAt"],
            "page": 2 if key == "nhm-2994" else None,
        },
        "notes": notes
        + " State programme release; not a contractor payment or proof of recipient use. No individual school, hospital, payee or transaction date is established. Unknown cells stay unknown. Coverage is partial.",
    }


def tables(raw):
    p = Tables()
    p.feed(raw.decode("utf8"))
    return p.tables


def mirrored(all_tables, match):
    ts = [t for t in all_tables if match(t)]
    if len(ts) != 2 or ts[0] != ts[1]:
        raise ValueError("Original/mirrored report tables disagree or changed")
    return ts[0]


def reconcile(rows, cols, totals, unit="crore", allow_rounding=False):
    results = []
    for j, col in enumerate(cols):
        tokens = [r[col] for r in rows if r[col] and not re.fullmatch(r"-+", r[col])]
        values = [Decimal(t.replace(",", "").rstrip("*")) for t in tokens]
        computed = sum(values, Decimal(0))
        printed = Decimal(totals[j].replace(",", ""))
        diff = computed - printed
        # Bound, not proof, for independently rounded cells. Blank is not zero.
        bound = Decimal(".005") * (len(values) + 1) if allow_rounding else Decimal(0)
        results.append(
            {
                "computedSourceUnits": str(computed),
                "printedSourceUnits": str(printed),
                "differenceSourceUnits": str(diff),
                "roundingBoundSourceUnits": str(bound),
                "unit": unit,
                "status": "exact"
                if diff == 0
                else "within_printed_precision"
                if abs(diff) <= bound
                else "conflict",
            }
        )
    return results


def emrs(raw, m):
    t = mirrored(
        tables(raw),
        lambda t: (
            t
            and t[0]
            == [
                "S. No.",
                "Name of the State/UT",
                "2020-21",
                "2021-22",
                "2022-23",
                "2023-24",
                "2024-25*",
            ]
        ),
    )
    rows = t[1:-1]
    if len(rows) != 28 or [r[0] for r in rows] != [str(i) for i in range(1, 29)]:
        raise ValueError("Complete EMRS state sequence required")
    checks = reconcile(rows, list(range(2, 7)), t[-1][2:], unit="lakh")
    out = []
    for r in rows:
        for j, year in enumerate(range(2020, 2025)):
            out.append(
                fact(
                    m,
                    "2153505",
                    year,
                    r[1],
                    "Eklavya Model Residential Schools",
                    "EMRS",
                    "education",
                    r[j + 2],
                    "lakh",
                    "2025-08-07",
                    f"EMRS year-wise funds released, state row {r[0]}, FY {year}-{str(year + 1)[2:]}",
                    "Ministry central-sector school programme; central-sector definition independently preserved from PIB 2153037. FY 2024–25 source amounts are marked provisional. New school construction versus running-cost split is not supplied; this is broad school education programme funding. Modern DNHDD correspondence for the source’s old DNH label is unresolved and retained historically.",
                    channel="central_sector",
                    conflict=checks[j]["status"] == "conflict",
                )
            )
    return out, checks


def rusa(raw, m):
    ts = tables(raw)
    header = ["S. No.", "States/ UTs", "2021- 22", "2022- 23", "2023- 24", "2024- 25", "2025-26"]
    indices = [i for i, t in enumerate(ts) if t and t[0] == header]
    if len(indices) != 4 or ts[indices[0]] != ts[indices[2]] or ts[indices[1]] != ts[indices[3]]:
        raise ValueError("RUSA continuation or mirrors changed")
    rows = ts[indices[0]][1:] + ts[indices[1]][1:-2]
    total = ts[indices[1]][-2]
    if len(rows) != 34 or [r[0] for r in rows] != [str(i) for i in range(1, 35)]:
        raise ValueError("RUSA state sequence changed")
    checks = reconcile(rows, list(range(2, 7)), total[2:], allow_rounding=True)
    out = []
    for r in rows:
        for j, year in enumerate(range(2021, 2026)):
            c = checks[j]
            out.append(
                fact(
                    m,
                    "2295018",
                    year,
                    r[1],
                    "RUSA / PM-USHA — state universities and colleges",
                    "RUSA-PMUSHA",
                    "education",
                    r[j + 2],
                    "crore",
                    "2026-08-05",
                    f"Annexure I, explicit Central Share Releases, state row {r[0]}, FY {year}-{str(year + 1)[2:]}",
                    f"University/college infrastructure and education-quality support. {c['status']}: printed state sum minus parent {c['differenceSourceUnits']} crore; independently rounded-cell bound {c['roundingBoundSourceUnits']} crore. Sum state cells only; parent is not added. Blanks have no zero definition.",
                    conflict=c["status"] == "conflict",
                )
            )
    return out, checks


def employment(raw, m):
    t = mirrored(
        tables(raw),
        lambda t: (
            t
            and len(t[0]) == 1
            and t[0][0].startswith(
                "State/Union Territory (UT)-wise details of funds released under Mahatma Gandhi NREGS"
            )
        ),
    )
    if t[2] != ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22"]:
        raise ValueError("MGNREGS reverse year order changed")
    rows = t[3:-1]
    if len(rows) != 34 or [r[0] for r in rows] != [str(i) for i in range(1, 35)]:
        raise ValueError("MGNREGS state sequence changed")
    checks = reconcile(rows, list(range(2, 7)), t[-1][2:], allow_rounding=True)
    out = []
    for r in rows:
        for j, year in enumerate(range(2025, 2020, -1)):
            c = checks[j]
            record = fact(
                m,
                "2288990",
                year,
                r[1],
                "Mahatma Gandhi National Rural Employment Guarantee Scheme",
                "MGNREGS",
                "employment",
                r[j + 2],
                "crore",
                "2026-07-24",
                f"Annexure II, funds released under MGNREGS, state row {r[0]}, FY {year}-{str(year + 1)[2:]}",
                f"Rural employment programme funding, including wages/material; no project allocation, individual wage payment or constructed-asset amount is established. {c['status']}: state sum minus printed parent {c['differenceSourceUnits']} crore, precision bound {c['roundingBoundSourceUnits']} crore. FY 2026–27 mother sanctions in Annexure I are not release evidence and were not imported.",
                conflict=c["status"] == "conflict",
            )
            if r[1].strip().rstrip("*").strip() == "West Bengal":
                record["notes"] += (
                    " Source footnote says releases stopped 9 March 2022 and no releases in the last five years; the FY 2021–22 numeric entry contradicts that last-five-years sentence and is withheld."
                )
                if year == 2021:
                    record["conflict"] = True
            out.append(record)
    return out, checks


def nhm_history(raw, m):
    t = mirrored(
        tables(raw),
        lambda t: (
            len(t) > 2
            and any(
                "Central Releases and Expenditure under National Health Mission" in cell
                for cell in t[1]
            )
        ),
    )
    if (
        t[3][2:7] != ["2016-17", "2017-18", "2018-19", "2019-20", "2020-21"]
        or t[4][:10] != ["Central Release", "Expenditure"] * 5
    ):
        raise ValueError("NHM release/expenditure column order changed")
    rows = [r for r in t if r and r[0].isdigit()]
    if len(rows) != 37:
        raise ValueError("NHM original jurisdiction sequence changed")
    out = []
    for r in rows:
        for j, year in enumerate(range(2016, 2021)):
            token = r[2 + j * 2] if 2 + j * 2 < len(r) - 1 else ""
            record = fact(
                m,
                "1780140",
                year,
                r[1],
                "National Health Mission",
                "NHM",
                "health",
                token,
                "crore",
                "2021-12-10",
                f"Annexure, state row {r[0]}, FY {year}-{str(year + 1)[2:]}, Central Release column",
                "Source Note 1 explicitly excludes state contribution. Adjacent expenditure column includes state money and opening balances and is not imported. Broad healthcare programme support; no hospital-construction split is established. No overall financial parent total is provided by this edition. Older combined jurisdictions retain their source identity.",
            )
            if r[1] == "Ladakh" and year <= 2019:
                record["aggregation"] = "context"
                record["notes"] += (
                    " Pre-reorganisation zeros are context only, not current-jurisdiction funding."
                )
            if year == 2020:
                record["conflict"] = True
                record["notes"] += (
                    " Later parliamentary 2994 edition covers FY 2020–21; withhold this overlap until source/edition review."
                )
            out.append(record)
    return out, {"parentTotalProvided": False, "stateRows": 37, "expenditureImported": False}


def nhm_latest(raw, m):
    reader = PdfReader(BytesIO(raw))
    text = reader.pages[1].extract_text(extraction_mode="layout")
    compact = " ".join(text.split())
    if (
        "Central Release" not in compact
        or "(Rs.in cr.)" not in compact
        or "do not include State share contribution" not in compact
    ):
        raise ValueError("NHM explicit Union share and crore header required")
    rows = []
    for line in text.splitlines():
        match = re.match(
            r"^\s*(\d+)\s+(.+?)\s{2,}([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s*$",
            line,
        )
        if match:
            rows.append(match.groups())
    if len(rows) != 36 or [r[0] for r in rows] != [str(i) for i in range(1, 37)]:
        raise ValueError("NHM complete 36-jurisdiction table required")
    out = []
    for r in rows:
        for j, year in enumerate(range(2020, 2025)):
            out.append(
                fact(
                    m,
                    "nhm-2994",
                    year,
                    r[1],
                    "National Health Mission",
                    "NHM",
                    "health",
                    r[2 + j],
                    "crore",
                    "2025-08-19",
                    f"Rajya Sabha Q2994, Annexure, PDF page 2, row {r[0]}, FY {year}-{str(year + 1)[2:]} Central Release",
                    "Note 1 explicitly identifies Central Govt grants, excluding state contribution. Publication blocked on Digital Sansad source rights; PIB permission does not apply. Broad healthcare support, not hospital-construction-only funding. Parent aggregate is not supplied; preserved source rows remain the accounting basis.",
                )
            )
    return out, {
        "parentTotalProvided": False,
        "stateRows": 36,
        "publicationGate": "Digital Sansad source-specific reuse review pending",
    }


def main():
    _, policy = fetch_pib_policy("rights")
    originals = []
    all_facts = []
    checks = {}
    for key, parser in [
        ("2153505", emrs),
        ("2295018", rusa),
        ("2288990", employment),
        ("1780140", nhm_history),
        ("nhm-2994", nhm_latest),
    ]:
        raw, m = acquire(key)
        facts, check = parser(raw, m)
        originals.append(m)
        all_facts += facts
        checks[key] = check
    _, definition = acquire("2153037")
    supporting = [definition]
    policy_gap = None
    try:
        _, sansad_policy = acquire("sansad-policy")
        supporting.append(sansad_policy)
    except (ValueError, subprocess.CalledProcessError):
        policy_gap = {
            "url": SOURCES["sansad-policy"][0],
            "status": "direct_fetch_unavailable",
            "gate": "Keep Sansad originals private; no source permission inferred.",
        }
    path = ACQUISITION / "funding-records.json"
    existing = json.loads(path.read_text())
    by_id = {r["id"]: r for r in existing["records"]}
    for r in all_facts:
        if r["id"] in by_id and by_id[r["id"]] != r:
            raise ValueError("Immutable programme edition conflict")
        by_id[r["id"]] = r
    existing["records"] = list(by_id.values())
    atomic_json(path, existing)
    ready = [
        r
        for r in all_facts
        if r["source"]["url"].startswith("https://www.pib.gov.in/")
        and r["amountRupees"] is not None
        and not r["conflict"]
        and r["aggregation"] == "leaf"
        and not r["jurisdiction"].startswith("historical:")
    ]
    packet = {
        "parserVersion": VERSION,
        "recordIds": [r["id"] for r in all_facts],
        "reviewableIds": [r["id"] for r in ready],
        "originals": originals,
        "policy": policy,
        "supportingOriginals": supporting,
        "checks": checks,
        "publication": "private_only",
        "reviewStatus": "source_and_fact_checks_prepared_owner_mfa_pending",
        "policyGap": policy_gap,
        "outages": [
            {
                "source": "https://nhm.gov.in/nhm/index4.php?lang=1&level=0&lid=686&linkid=457",
                "status": "bounded_request_timed_out",
                "nextAction": "Retry official MIS source when healthy; its attribution policy does not license the Sansad-hosted original.",
            }
        ],
    }
    review = ACQUISITION / "funding-programmes-review.json"
    if review.exists():
        prior = json.loads(review.read_text())
        if (
            prior.get("recordIds") == packet["recordIds"]
            and prior.get("reviewableIds") == packet["reviewableIds"]
        ):
            for key in ("publication", "reviewStatus", "publicationCheckpoint"):
                if key in prior:
                    packet[key] = prior[key]
    atomic_json(review, packet)
    review.chmod(0o600)
    print(
        json.dumps(
            {
                "privateCandidates": len(all_facts),
                "reviewableCandidates": len(ready),
                "publicationsWritten": 0,
                "sources": list(checks),
            }
        )
    )


if __name__ == "__main__":
    main()
