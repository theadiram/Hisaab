"""Separate eight-UT acquisition/review register; never masquerades as 28 states.

Recovers UT rows deliberately outside the older state-only adapter. Public
procurement collection follows only recorded official routes and visible links.
No CAPTCHA is solved, no search filter is guessed, and no payment is inferred.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urlparse

from jurisdiction_procurement_sources import source_for
from nhidcl_card_review import clean, source_date
from state_development_amounts import rupees, reference
from state_development_collection import ROOT, fetch, extract, write, now
from state_development_normalize import source_projects, monthly_accounts
from state_development_classification import suggest
from cag_state_accounts_collection import latest_report

BASE = ROOT / "data/acquisition/union-territory-development"
TERRITORIES = [
    ("35", "Andaman and Nicobar Islands"),
    ("4", "Chandigarh"),
    ("26", "Dadra and Nagar Haveli and Daman and Diu"),
    ("7", "Delhi"),
    ("1", "Jammu and Kashmir"),
    ("37", "Ladakh"),
    ("31", "Lakshadweep"),
    ("34", "Puducherry"),
]
NHIDCL_NAMES = {
    "Andaman & Nicobar": "35",
    "Jammu & Kashmir (RO- Jammu)": "1",
    "Jammu & Kashmir (RO- Srinagar)": "1",
    "Ladakh": "37",
}
SUMMARY = ROOT / "data/union-territory-development-acquisition.json"
ADDITIONAL_SOURCES = {
    "4": [
        {
            "id": "chandigarh-electrical-division1-rti-2026",
            "kind": "department_budget",
            "label": "Chandigarh Electrical Division 1 budget/expenditure disclosure updated May 2026",
            "url": "https://chandigarh.gov.in/sites/default/files/RTI/r2i-elediv1-1905.pdf",
        },
        {
            "id": "chandigarh-marketing-board-rti-2026",
            "kind": "department_budget",
            "label": "Chandigarh Agricultural Marketing Board budget disclosure FY2025–26",
            "url": "https://chandigarh.gov.in/sites/default/files/RTI/r2i-smbrd-2005.pdf",
        },
    ],
    "1": [
        {
            "id": "jk-ut-monthly-accounts-index-cag-host",
            "kind": "monthly_expenditure_index",
            "label": "CAG Jammu and Kashmir UT monthly accounts index (working official CAG host)",
            "url": "https://cag.gov.in/ae/jammu-and-kashmir/en/state-accounts-report?defuat_account_report_type=360",
        }
    ],
    "34": [
        {
            "id": "puducherry-beams-current-index",
            "kind": "budget_index",
            "label": "Puducherry BEAMS public budget index; scheduled maintenance must be respected",
            "url": "https://beams.py.gov.in/",
        }
    ],
    "37": [
        {
            "id": "ladakh-finance-utilisation-review-2026",
            "kind": "budget_index",
            "label": "Official Ladakh expenditure review describing the underlying registers, not an expenditure export",
            "url": "https://ladakh.gov.in/chief-secretary-reviews-budget-expenditure-for-fy-2026-27-calls-for-improved-fund-utilisation-and-timely-execution-of-development-works/",
        }
    ],
    "31": [
        {
            "id": "lakshadweep-pao-record-custodian",
            "kind": "budget_index",
            "label": "Lakshadweep Pay and Accounts Office official records/custodian page",
            "url": "https://lakshadweep.gov.in/departments-new/pay-and-accounts-office/",
        }
    ],
}


def project_rows(master):
    results = []
    seen = set()
    for table in master["tables"]:
        for row in table[1:]:
            if len(row) != 20:
                raise ValueError("NHIDCL original row schema changed")
            code = NHIDCL_NAMES.get(clean(row[1]))
            if not code:
                continue
            completion = source_date(row[17])
            status = clean(row[4])
            if status == "Completed" and (
                completion is None or not "2025-04-01" <= completion <= "2026-08-31"
            ):
                continue
            upn = re.sub(r"\s+", "", row[3] or "")
            if not upn or upn in seen:
                raise ValueError("Missing or duplicate UT UPN")
            seen.add(upn)
            printed_name = clean(row[18])
            contractor = (
                None
                if (printed_name or "").lower()
                in ("", "-", "--", "na", "n/a", "nil", "not awarded", "not applicable")
                else printed_name
            )
            results.append(
                {
                    "id": f"{master['source']['sha256']}:UPN:{upn}",
                    "stateCode": code,
                    "sourceProjectId": upn,
                    "projectIdBasis": "official_pmp_upn",
                    "title": clean(row[5]),
                    "contractorName": contractor,
                    "contractorNameSource": printed_name,
                    "stage": status,
                    "projectCostRupees": rupees(clean(row[9]) or "-", "crore"),
                    "contractAmountRupees": rupees(clean(row[10]) or "-", "crore"),
                    "awardDate": source_date(row[11]),
                    "awardDateSource": clean(row[11]),
                    "reportedCompletionDate": completion,
                    "financialYear": None,
                    "sourceSnapshotYear": "2026-2027",
                    "periodEnd": "2026-08-31",
                    "paymentAmountRupees": None,
                    "location": None,
                    "reviewStatus": "awaiting_review",
                    "source": reference(
                        master["source"],
                        f"PDF page 2, official UPN {upn}, table row {row[0]}; as of 31 August 2026",
                    ),
                    "notes": "Lifetime project/awarded costs, not annual payments. Actual site, allocated bill/payment, funding year and completion certificate remain unknown. Original contractor contacts excluded.",
                }
            )
    return results


def budget_rows(context, code, name):
    rows = []
    for r in context["records"]:
        if r["jurisdiction"] != name:
            continue
        rows.append(
            {
                "id": f"{r['sourceHash']}:ut-demand:{r['demandNumber']}:{r['financialYear']}",
                "stateCode": code,
                "financialYear": r["financialYear"],
                "purposeLabel": f"Union demand {r['demandNumber']} — {r['scopeType'].replace('_', ' ')}",
                "measure": "allocated",
                "estimate": "original",
                "unit": "crore",
                "sourceTotal": r["reportedTotal"],
                "amountRupees": rupees(r["reportedTotal"] or "-", "crore"),
                "revenueRupees": rupees(r["revenue"] or "-", "crore"),
                "capitalRupees": rupees(r["capital"] or "-", "crore"),
                "budgetTableScope": "union_ut_demand_net_context",
                "classification": "broad_financial_context",
                "reviewStatus": "awaiting_review",
                "publicationApproved": False,
                "source": {
                    "url": r["sourceUrl"],
                    "sha256": r["sourceHash"],
                    "locator": r["locator"],
                },
                "notes": r["warning"],
            }
        )
    return rows


def preserve(source, state, checkpoint):
    old = next((d for d in checkpoint["documents"] if d["url"] == source["url"]), None)
    if old:
        return old, json.loads((ROOT / old["extraction"]).read_text())
    raw, receipt = fetch(source, state)
    evidence = extract(raw, receipt)
    target = BASE / state["code"] / (receipt["sha256"] + ".json")
    write(target, evidence)
    document = {
        **receipt,
        "extraction": str(target.relative_to(ROOT)),
        "numericLines": evidence["numericLines"],
        "sourceTables": len(evidence["tables"]),
        "extractedPages": len(evidence["pages"]),
        "completeExtraction": evidence["completeExtraction"],
    }
    checkpoint["documents"].append(document)
    checkpoint["failures"] = [x for x in checkpoint["failures"] if x["url"] != source["url"]]
    return document, evidence


def collect(code, name):
    state = {"code": code, "name": name}
    path = BASE / code / "checkpoint.json"
    cp = (
        json.loads(path.read_text())
        if path.exists()
        else {"code": code, "state": name, "documents": [], "failures": []}
    )
    portals = source_for(name)["portals"]
    # Exclude the shared ePublishing feed from UT attribution. A shared page's
    # latest rows cannot all be assigned to Andaman and Nicobar.
    sources = [
        {
            "id": f"ut-procurement-{code}-{i}",
            "kind": "procurement_report",
            "label": f"{name} official procurement portal",
            "url": p["url"],
        }
        for i, p in enumerate(portals)
        if p["platform"] != "cppp_epublishing"
    ]
    sources += ADDITIONAL_SOURCES.get(code, [])
    for source in sources:
        try:
            document, evidence = preserve(source, state, cp)
            redirects = [
                a
                for a in evidence["links"]
                if a["label"] == "Explicit page redirect"
                and urlparse(a["url"]).hostname == urlparse(source["url"]).hostname
            ]
            if redirects:
                preserve(
                    {
                        "id": source["id"] + "-visible-redirect",
                        "kind": "procurement_report",
                        "label": "Explicit public portal redirect",
                        "url": redirects[0]["url"],
                        "contextUrl": source["url"],
                    },
                    state,
                    cp,
                )
            if source["kind"] == "monthly_expenditure_index":
                listing = latest_report(
                    name, source["url"], (ROOT / document["original"]).read_text(errors="replace")
                )
                if listing.get("sourceUrl"):
                    preserve(
                        {
                            "id": source["id"] + "-latest-report",
                            "kind": "reported_expenditure",
                            "label": f"{name} official {listing['month']} {listing['year']} monthly indicators",
                            "url": listing["sourceUrl"],
                            "contextUrl": source["url"],
                        },
                        state,
                        cp,
                    )
        except Exception as exc:
            cp["failures"] = [x for x in cp["failures"] if x["url"] != source["url"]] + [
                {
                    "sourceId": source["id"],
                    "url": source["url"],
                    "error": str(exc)[:240],
                    "checkedAt": now(),
                }
            ]
        cp["updatedAt"] = now()
        cp["completeCoverage"] = False
        write(path, cp)
    return cp


def index():
    master = json.loads(
        (ROOT / "data/acquisition/state-development/nhidcl-tables.json").read_text()
    )
    if (
        hashlib.sha256((ROOT / master["source"]["original"]).read_bytes()).hexdigest()
        != master["source"]["sha256"]
    ):
        raise ValueError("NHIDCL original checksum mismatch")
    projects = project_rows(master)
    context = json.loads(
        (ROOT / "data/acquisition/national-coverage/union-ut-budget-context.json").read_text()
    )
    summaries = []
    for order, (code, name) in enumerate(TERRITORIES, 1):
        folder = BASE / code
        folder.mkdir(parents=True, exist_ok=True)
        p = folder / "checkpoint.json"
        cp = (
            json.loads(p.read_text())
            if p.exists()
            else {"code": code, "state": name, "documents": [], "failures": []}
        )
        if not any(d["sha256"] == master["source"]["sha256"] for d in cp["documents"]) and any(
            r["stateCode"] == code for r in projects
        ):
            cp["documents"].append(
                {
                    **master["source"],
                    "sourceId": "nhidcl-ut-register",
                    "stateCode": code,
                    "state": name,
                    "numericLines": 0,
                    "sourceTables": 1,
                    "extractedPages": 2,
                    "completeExtraction": True,
                }
            )
        selected = [r for r in projects if r["stateCode"] == code]
        expenditure = []
        for doc in cp["documents"]:
            if not doc.get("extraction"):
                continue
            evidence = json.loads((ROOT / doc["extraction"]).read_text())
            if doc["sourceKind"] == "procurement_report":
                selected += source_projects(doc, evidence)
            if doc["sourceKind"] == "reported_expenditure":
                expenditure += monthly_accounts(doc, evidence)
        ids = [r["id"] for r in selected]
        if len(ids) != len(set(ids)):
            raise ValueError(f"Duplicate UT source identities: {name}")
        budgets = budget_rows(context, code, name)
        write(
            folder / "candidates.json",
            {
                "stateCode": code,
                "updatedAt": now(),
                "budgetCandidates": budgets,
                "expenditureCandidates": expenditure,
                "projectCandidates": selected,
                "publication": "private_only",
                "approved": False,
            },
        )
        write(
            folder / "classification.json",
            {"rows": [suggest(r) for r in budgets], "approved": False},
        )
        write(
            folder / "reconciliation.json",
            {
                "checkedAt": now(),
                "identityCheck": "unique",
                "tableControls": [],
                "scopeWarnings": [
                    "Union UT demands overlap other budget/programme records.",
                    "A Union transfer demand is not the full local UT budget.",
                    "Procurement notices are not awards or payments.",
                ],
                "overlapGroups": [],
                "remaining": [
                    "Development and maintenance classification",
                    "Local budget and expenditure registers",
                    "Exact geography and allocated payment evidence",
                    "Source-rights and owner publication review",
                ],
                "publicationApproved": False,
                "completeCoverage": False,
            },
        )
        cp["updatedAt"] = now()
        cp["completeCoverage"] = False
        write(p, cp)
        action = "Review acquired procurement/contract facts; obtain exact project geography, allocated bills, recipient payment dates and source rights. Union transfer/territory demands are mixed context, not a complete local development budget."
        summaries.append(
            {
                "code": code,
                "name": name,
                "order": order,
                "originals": len(cp["documents"]),
                "pdfs": len(
                    {d["sha256"] for d in cp["documents"] if d["contentType"] == "application/pdf"}
                ),
                "blockedSources": len(cp["failures"]),
                "status": "partial_collected",
                "nextAction": action,
                "budgetCandidates": len(budgets),
                "budgetContextCandidates": len(budgets),
                "namedBudgetCandidates": 0,
                "expenditureCandidates": len(expenditure),
                "projectCandidates": len(selected),
                "completeCoverage": False,
            }
        )
    result = {
        "updatedAt": now(),
        "financialYears": ["2025-2026", "2026-2027"],
        "scope": "Eight UT project evidence and Union-demand context; existing Delhi/Puducherry collections remain separate linked sources.",
        "states": summaries,
        "completeStates": 0,
        "statesWithBudgetCandidates": 8,
        "statesWithNamedBudgetCandidates": 0,
        **{
            k: sum(s[k] for s in summaries)
            for k in [
                "originals",
                "pdfs",
                "budgetCandidates",
                "expenditureCandidates",
                "projectCandidates",
            ]
        },
    }
    write(SUMMARY, result)
    print(
        json.dumps(
            {
                "territories": 8,
                "recoveredNhidclProjects": len(projects),
                "projectCandidates": result["projectCandidates"],
                "budgetContextCandidates": result["budgetCandidates"],
                "completeTerritories": 0,
            }
        ),
        flush=True,
    )
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--collect", action="store_true")
    args = parser.parse_args()
    if args.collect:
        for code, name in TERRITORIES:
            collect(code, name)
            index()
    else:
        index()
