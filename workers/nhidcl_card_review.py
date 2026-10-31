"""Check NHIDCL candidate facts against the original table, without publication.

Ranks documentary review work only. Cost, progress and award date never become
payments or locations. Original contractor contact columns are never projected.
"""

import hashlib
import json
import re
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/state-development"


def clean(value):
    return " ".join((value or "").split()) or None


def rupees(value):
    value = clean(value)
    if value in (None, "-", "--"):
        return None
    if not re.fullmatch(r"-?\d[\d,]*(?:\.\d+)?", value):
        raise ValueError("Unrecognized source crore amount")
    exact = Decimal(value.replace(",", "")) * Decimal("10000000")
    if exact != exact.quantize(Decimal(".01")):
        raise ValueError("Source amount has sub-paise precision")
    return format(exact, ".2f")


def source_date(value):
    try:
        return datetime.strptime(clean(value), "%d/%m/%Y").date().isoformat()
    except (ValueError, TypeError):
        return None


def review_rows(table, candidates, source):
    if (
        len(table[0]) != 20
        or clean(table[0][3]) != "PMP (UPN- ID)"
        or clean(table[0][9]) != "TPC (in Crore)"
        or clean(table[0][10]) != "Awarded Cost (in Cr.)"
    ):
        raise ValueError("Original UPN/cost headings or units changed")
    by_upn = {}
    for row in table[1:]:
        if len(row) != 20 or not (row[0] or "").isdigit():
            raise ValueError("Unexpected original project row")
        upn = re.sub(r"\s+", "", row[3] or "")
        if not upn or upn in by_upn:
            raise ValueError("Missing or repeated original UPN; identity review needed")
        by_upn[upn] = row
    results = []
    for candidate in candidates:
        if candidate.get("projectIdBasis") != "official_pmp_upn":
            continue
        if candidate.get("source", {}).get("sha256") != source["sha256"]:
            raise ValueError("Candidate points to a different original edition")
        row = by_upn.get(candidate["sourceProjectId"])
        if row is None:
            raise ValueError("Candidate official UPN absent from original")
        comparisons = {
            "title": clean(row[5]),
            "stage": clean(row[4]),
            "projectCostRupees": rupees(row[9]),
            "contractAmountRupees": rupees(row[10]),
            "awardDate": source_date(row[11]),
            "reportedCompletionDate": source_date(row[17]),
        }
        printed_contractor = clean(row[18])
        candidate_contractor = (
            None
            if (printed_contractor or "").lower()
            in ("", "-", "--", "na", "n/a", "nil", "not awarded", "not applicable")
            else printed_contractor
        )
        if candidate.get("contractorName") != candidate_contractor:
            raise ValueError(
                f"Candidate contractor differs from original row: {candidate['sourceProjectId']}"
            )
        if any(candidate.get(key) != value for key, value in comparisons.items()):
            raise ValueError(
                f"Candidate facts differ from original row: {candidate['sourceProjectId']}"
            )
        contractor = printed_contractor
        named = bool(
            contractor
            and not re.search(
                r"^(?:-+|to be|not awarded|not appointed|not applicable|n/?a|nil|unknown)(?:\s|$)",
                contractor,
                re.I,
            )
        )
        amount = comparisons["contractAmountRupees"]
        contract_positive = amount is not None and Decimal(amount) > 0
        lifecycle_issue = bool(
            re.search(
                r"terminat|foreclos|re.?award|not appointed|not awarded", clean(row[4]) or "", re.I
            )
        )
        usable = bool(
            named and contract_positive and comparisons["awardDate"] and not lifecycle_issue
        )
        gaps = [
            "Exact project geography has not been reviewed.",
            "Bill-to-project allocation, payment date and final payment recipient are absent.",
            "Reported completion is not a completion certificate.",
            "Document-level rights and explicit owner publication decisions remain required.",
        ]
        if lifecycle_issue:
            gaps.append(
                "Terminated, foreclosed, reaward or unappointed status requires contract-edition review."
            )
        if not named:
            gaps.append("Source contractor field does not establish a named contractor.")
        if not contract_positive:
            gaps.append("No positive awarded contract amount is established in this edition.")
        if not comparisons["awardDate"]:
            gaps.append("Source award field does not establish a calendar award date.")
        results.append(
            {
                "candidateId": candidate["id"],
                "stateCode": candidate["stateCode"],
                "officialProjectId": candidate["sourceProjectId"],
                "title": comparisons["title"],
                "checkedFacts": {**comparisons, "contractorName": contractor if named else None},
                "source": {
                    "url": source["url"],
                    "sha256": source["sha256"],
                    "page": 2,
                    "row": row[0],
                },
                "fieldChecks": {
                    "originalTableMatched": True,
                    "explicitCroreHeadings": True,
                    "costConversionMatched": True,
                    "awardDateMatched": True,
                    "positiveContractAmount": contract_positive,
                    "namedContractor": named,
                    "lifecycleReviewRequired": lifecycle_issue,
                },
                "reviewPriority": "contract_facts_first" if usable else "resolve_source_gaps",
                "blockers": gaps,
                "paymentEvidenceVerified": False,
                "locationEvidenceVerified": False,
                "publicationApproved": False,
            }
        )
    return results


def main():
    master = json.loads((BASE / "nhidcl-tables.json").read_text())
    source = master["source"]
    path = ROOT / source["original"]
    if hashlib.sha256(path.read_bytes()).hexdigest() != source["sha256"]:
        raise ValueError("Original PDF checksum mismatch")
    with pdfplumber.open(path) as document:
        tables = document.pages[1].extract_tables()
    if tables != master["tables"] or len(tables) != 1:
        raise ValueError("Cached original table differs from fresh extraction")
    candidates = []
    paths = list(BASE.glob("*/candidates.json")) + list(
        (ROOT / "data/acquisition/union-territory-development").glob("*/candidates.json")
    )
    for path in sorted(paths):
        candidates.extend(json.loads(path.read_text())["projectCandidates"])
    rows = review_rows(tables[0], candidates, source)
    counts = dict(Counter(r["reviewPriority"] for r in rows))
    result = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "sourceOriginalSha256": source["sha256"],
        "originalChecksumMatched": True,
        "freshTableMatchesPreservedExtraction": True,
        "records": rows,
        "candidatesChecked": len(rows),
        "reviewPriorities": counts,
        "statesChecked": len(
            {r["stateCode"] for r in rows if r["stateCode"] not in {"35", "1", "37"}}
        ),
        "territoriesChecked": len(
            {r["stateCode"] for r in rows if r["stateCode"] in {"35", "1", "37"}}
        ),
        "jurisdictionsChecked": len({r["stateCode"] for r in rows}),
        "publicationApproved": False,
        "scope": "Original-source equality and exact unit/date checks; not owner publication approval or payment verification.",
    }
    out = BASE / "nhidcl-review/card-review-packets.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    out.chmod(0o600)
    print(
        json.dumps(
            {
                key: result[key]
                for key in (
                    "candidatesChecked",
                    "statesChecked",
                    "reviewPriorities",
                    "publicationApproved",
                )
            }
        )
    )


if __name__ == "__main__":
    main()
