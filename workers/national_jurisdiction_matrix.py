#!/usr/bin/env python3
"""Build a source-scope matrix for the 28 states and 8 union territories.

This is a coverage ledger, not a national spending estimate. Counts are source
rows/candidates and deliberately do not add across overlapping programmes.
"""

import json
from pathlib import Path
from jurisdiction_procurement_sources import (
    source_for as procurement_source_for,
    validate_scope as procurement_scope,
)

ROOT = Path(__file__).resolve().parents[1]
JURISDICTIONS = [
    ("Andhra Pradesh", "state"),
    ("Arunachal Pradesh", "state"),
    ("Assam", "state"),
    ("Bihar", "state"),
    ("Chhattisgarh", "state"),
    ("Goa", "state"),
    ("Gujarat", "state"),
    ("Haryana", "state"),
    ("Himachal Pradesh", "state"),
    ("Jharkhand", "state"),
    ("Karnataka", "state"),
    ("Kerala", "state"),
    ("Madhya Pradesh", "state"),
    ("Maharashtra", "state"),
    ("Manipur", "state"),
    ("Meghalaya", "state"),
    ("Mizoram", "state"),
    ("Nagaland", "state"),
    ("Odisha", "state"),
    ("Punjab", "state"),
    ("Rajasthan", "state"),
    ("Sikkim", "state"),
    ("Tamil Nadu", "state"),
    ("Telangana", "state"),
    ("Tripura", "state"),
    ("Uttar Pradesh", "state"),
    ("Uttarakhand", "state"),
    ("West Bengal", "state"),
    ("Andaman and Nicobar Islands", "unionTerritory"),
    ("Chandigarh", "unionTerritory"),
    ("Dadra and Nagar Haveli and Daman and Diu", "unionTerritory"),
    ("Delhi", "unionTerritory"),
    ("Jammu and Kashmir", "unionTerritory"),
    ("Ladakh", "unionTerritory"),
    ("Lakshadweep", "unionTerritory"),
    ("Puducherry", "unionTerritory"),
]
ALIASES = {
    "Andaman And Nicobar": "Andaman and Nicobar Islands",
    "Andaman And Nicobar Islands": "Andaman and Nicobar Islands",
    "The Dadra And Nagar Haveli And Daman And Diu": "Dadra and Nagar Haveli and Daman and Diu",
    "Dadra and Nagar Haveli and Daman and Diu": "Dadra and Nagar Haveli and Daman and Diu",
    "Jammu And Kashmir": "Jammu and Kashmir",
    "Keralam": "Kerala",
}


def canonical(name):
    return ALIASES.get(name, name)


def load(path):
    return json.loads(Path(path).read_text())


def sum_rows(report, house):
    return {canonical(s["name"]): s["rows"] for s in report["states"]}


UT_DEMANDS = {
    "Andaman and Nicobar Islands": 52,
    "Chandigarh": 53,
    "Dadra and Nagar Haveli and Daman and Diu": 54,
    "Ladakh": 55,
    "Lakshadweep": 56,
    "Delhi": 57,
    "Jammu and Kashmir": 58,
    "Puducherry": 59,
}


def build(state_development, pmgsy, lok, rajya, rural, union25, union26):
    development = {s["name"]: s for s in state_development["states"]}
    pmgsy_by_name = {canonical(s["state"]): s for s in pmgsy["statePartitions"]}
    lok_rows, rajya_rows = sum_rows(lok, "lokSabha"), sum_rows(rajya, "rajyaSabha")
    rural_measures = {}
    for measure in ("mgnregsReleases", "mgnregsWaterWorks", "vbGramG"):
        rural_measures[measure] = {
            canonical(r["jurisdiction"]): r for r in rural[measure]["records"]
        }
    delhi_manifest_path = (
        ROOT / "data/acquisition/national-coverage/delhi-budget-2026-27-manifest.json"
    )
    delhi_manifest = (
        json.loads(delhi_manifest_path.read_text()) if delhi_manifest_path.exists() else None
    )
    union_rows = {}
    for year, inventory in [("2025-26", union25), ("2026-27", union26)]:
        for name, demand in UT_DEMANDS.items():
            n = sum(1 for row in inventory["rows"] if row.get("demandNumber") == demand)
            union_rows.setdefault(name, {})[year] = n
    matrix = []
    for name, kind in JURISDICTIONS:
        dev = development.get(name)
        road = pmgsy_by_name.get(name)
        matrix.append(
            {
                "jurisdiction": name,
                "type": kind,
                "stateBudget": {
                    "status": "collected_partial" if dev else "not_in_28_state_budget_register",
                    "budgetCandidates": dev.get("budgetCandidates", 0) if dev else None,
                    "reportedExpenditureCandidates": dev.get("expenditureCandidates", 0)
                    if dev
                    else None,
                    "projectTenderCandidates": dev.get("projectCandidates", 0) if dev else None,
                    "complete": bool(dev and dev.get("completeCoverage")),
                },
                "pmgsy": {
                    "status": road.get("status", "not_in_source_partition")
                    if road
                    else "not_in_source_partition",
                    "sourceRows": road.get("sourceRows") if road else None,
                    "candidateWorks": road.get("normalizedCandidates") if road else None,
                    "isPaymentEvidence": False,
                },
                "mpladsDefaultExpenditureRows": {
                    "lokSabha": lok_rows.get(name, 0),
                    "rajyaSabha": rajya_rows.get(name, 0),
                    "combinedSourceRows": lok_rows.get(name, 0) + rajya_rows.get(name, 0),
                    "isUniquePaymentCount": False,
                },
                "mordSchemeAggregates": {
                    measure: (name in rural_measures[measure]) for measure in rural_measures
                },
                "additionalBudgetDocuments": (
                    {
                        "status": "originals_preserved_private_not_classified",
                        "volumes": len(delhi_manifest["volumes"]),
                        "pages": delhi_manifest.get("totalPages"),
                        "searchablePages": delhi_manifest.get("searchablePages"),
                        "scannedPages": sum(
                            len(x["pages"]) for x in delhi_manifest.get("scanPages", [])
                        ),
                    }
                    if name == "Delhi" and delhi_manifest
                    else None
                ),
                "unionBudgetUtDemand": (
                    {
                        "demandNumber": UT_DEMANDS[name],
                        "fiscalRowCandidates": union_rows.get(name, {}),
                        "status": "source_rows_present_classification_and_reconciliation_pending",
                        "scope": "Union Budget MHA/UT transfer demand rows; not a complete UT budget or development-only total.",
                    }
                    if kind == "unionTerritory"
                    else None
                ),
                "officialProcurementPortals": procurement_source_for(name),
                "completeProjectPaymentCards": 0,
            }
        )
    return {
        "asOf": "2026-10-15",
        "scope": "28 states and 8 union territories",
        "jurisdictionCount": len(matrix),
        "completeJurisdictions": sum(x["stateBudget"]["complete"] for x in matrix),
        "interpretation": "Counts from different schemes and source systems overlap and must not be added into one spending total. Presence means a source partition or candidate exists, not verified expenditure, settlement, complete geography, or republication rights.",
        "sourceScopes": {
            "stateBudget": "Two-year state-development extraction register; candidate rows only.",
            "pmgsy": "Official public PMGSY road/tender dashboard partitions; row/candidate amounts do not establish paid amounts.",
            "mplads": "Default Lok Sabha and Rajya Sabha expenditure report rows; one scheme, not all development expenditure or unique payments.",
            "mord": "State/UT scheme aggregate rows for MGNREGS releases, water-related work expenditure and VB-G RAM-G interim allocation/mother sanction; not project-level payment records.",
        },
        "procurementPortalDirectory": {
            "source": "https://eprocure.gov.in/mmp/sites/default/files/eproc/States_eProc_relatedlinks.pdf",
            "mappedJurisdictions": procurement_scope()["mapped"],
            "directlyListedJurisdictions": procurement_scope()["directlyListed"],
            "supplementalOfficialRoutes": procurement_scope()["supplementalRoutes"],
            "totalJurisdictions": procurement_scope()["expected"],
            "interpretation": "Official GePNIC/CPPP directory entries plus separately verified official routes for Andaman and Nicobar Islands and Ladakh. Portal presence does not prove completeness, accessible bulk export, award/payment coverage, or reuse rights.",
        },
        "matrix": matrix,
    }


def markdown(data):
    out = [
        "# Coverage ledger: 28 states and 8 union territories",
        "",
        f"As of {data['asOf']}. This is a **source-coverage inventory**, not a claim of complete funding or payment coverage.",
        "",
        "Counts are not additive across schemes. MPLADS counts are source rows, PMGSY counts are source road/tender candidates, state-budget counts are extracted candidates, and MoRD records are scheme-level aggregates. None is a count of verified payment-backed project cards.",
        "",
        "| Jurisdiction | State budget candidates (budget / expenditure / project) | Union UT demand rows (FY26 / FY27) | PMGSY (source rows / candidates) | MPLADS default rows (Lok Sabha + Rajya Sabha) | MoRD scheme aggregates | Complete cards |",
        "|---|---:|---:|---:|---:|---|---:|",
    ]
    for x in data["matrix"]:
        b = x["stateBudget"]
        p = x["pmgsy"]
        m = x["mpladsDefaultExpenditureRows"]
        r = x["mordSchemeAggregates"]
        budget = (
            f"{b['budgetCandidates']:,} / {b['reportedExpenditureCandidates']:,} / {b['projectTenderCandidates']:,}"
            if b["budgetCandidates"] is not None
            else "Not in 28-state register"
        )
        roads = (
            f"{p['sourceRows']:,} / {p['candidateWorks']:,}"
            if p["sourceRows"] is not None and p["candidateWorks"] is not None
            else ("Partition failed" if p["status"] == "access_failed" else "No partition")
        )
        ub = x["unionBudgetUtDemand"]
        union = (
            f"{ub['fiscalRowCandidates'].get('2025-26', 0)} / {ub['fiscalRowCandidates'].get('2026-27', 0)}"
            if ub
            else "—"
        )
        mpl = f"{m['lokSabha']:,} + {m['rajyaSabha']:,}"
        rural = (
            "MGNREGS release"
            + (", water works" if r["mgnregsWaterWorks"] else "")
            + (", VB-G RAM-G" if r["vbGramG"] else "")
            if r["mgnregsReleases"]
            else "None in collected tables"
        )
        out.append(f"| {x['jurisdiction']} | {budget} | {union} | {roads} | {mpl} | {rural} | 0 |")
    ut_register_path = ROOT / "data/union-territory-development-acquisition.json"
    if ut_register_path.exists():
        uts = json.loads(ut_register_path.read_text())
        out += [
            "",
            "## Eight-UT project and evidence review register",
            "",
            "This separate register closes the former state-only card-view gap. Counts are candidate source records, not unique projects, approved payments or complete local budgets. Existing Delhi and Puducherry dossiers remain separately linked; none is overwritten.",
            "",
            "| Union territory | Mixed Union demand-context entries | Project/tender records | Source gaps |",
            "|---|---:|---:|---:|",
        ]
        for row in uts["states"]:
            out.append(
                f"| {row['name']} | {row['budgetCandidates']} | {row['projectCandidates']} | {row['blockedSources']} |"
            )
        out += [
            "",
            "Twenty-one in-scope NHIDCL project rows previously excluded by the 28-state adapter are recovered for Andaman and Nicobar (5), Jammu and Kashmir (12) and Ladakh (4). Remaining candidates are observed public procurement notices. Awards, exact locations, bill allocations, recipient payments, reuse review and source completeness remain outstanding.",
        ]
    context_path = ROOT / "data/acquisition/national-coverage/union-ut-budget-context.json"
    if context_path.exists():
        context = json.loads(context_path.read_text())
        out += [
            "",
            "## Union Budget context totals for UTs — unreviewed, not development spending",
            "",
            "The following FY2026–27 net budget-demand figures are taken from the MHA/UT demand summary and are retained as private candidates. The five territory demands include administrative and other expenditure; Delhi, Jammu and Kashmir, and Puducherry are transfer demands, not the complete UT budgets. These values are not published Hisaab development totals, state utilization, project allocations, or contractor payments.",
            "",
            "| UT | Union demand scope | FY2026–27 BE net total (₹ crore) |",
            "|---|---|---:|",
        ]
        by_name = {
            r["jurisdiction"]: r for r in context["records"] if r["financialYear"] == "2026-2027"
        }
        for name, _kind in JURISDICTIONS[28:]:
            record = by_name[name]
            amount = (
                record["reportedTotal"] if record["reportedTotal"] is not None else "Not reported"
            )
            label = (
                "Transfer demand"
                if record["scopeType"] == "transfer_demand"
                else "UT territory demand"
            )
            out.append(f"| {name} | Demand {record['demandNumber']} · {label} | {amount} |")
    ut_lines_path = ROOT / "data/acquisition/national-coverage/union-ut-demand-lines.json"
    puducherry_path = (
        ROOT / "data/acquisition/national-coverage/puducherry-accounts-2026-27-index.json"
    )
    if ut_lines_path.exists() or puducherry_path.exists():
        lines = json.loads(ut_lines_path.read_text()) if ut_lines_path.exists() else {"rowCount": 0}
        accounts = (
            json.loads(puducherry_path.read_text())
            if puducherry_path.exists()
            else {
                "sources": [],
                "pageCount": 0,
                "voucherLineCount": 0,
                "distinctAccountHeadCount": 0,
                "pendingListedReports": None,
            }
        )
        missing_combinations = accounts.get("unlistedRegionMonthCombinations")
        monthly_gap = (
            f" {missing_combinations} of 24 possible region/month combinations were not listed at retrieval."
            if missing_combinations is not None
            else ""
        )
        out += [
            "",
            "## UT detailed budgets and monthly accounts acquired",
            "",
            "These are private acquisition records, not approved development amounts. Account vouchers can include refunds, receipts, and suspense activity; they are not automatically contractor settlements. Do not sum voucher rows or infer project links.",
            "",
            "| Territory / source | Acquired | Meaning and open gap |",
            "|---|---|---|",
            f"| All eight UTs · Union Budget MHA/UT Demands 52–59 | {lines.get('rowCount', 0):,} raw lines from FY2025–26 and FY2026–27 | Source locators preserved; gross/net, parent-child rows and development classification remain unreviewed. |",
            f"| Puducherry · Directorate of Accounts monthly compilation | {len(accounts.get('sources', []))} PDFs · {accounts.get('pageCount', 0):,} pages · {accounts.get('voucherLineCount', 0):,} voucher lines · {accounts.get('distinctAccountHeadCount', 0):,} distinct account-head descriptions | FY2026–27, April–September 2026, from the official downloads page.{monthly_gap} No project allocation/settlement link; source rights review pending. |",
            "| Ladakh | LIFMS and public Finance Department reviews located | Raw system requires credentials and verification code; no access bypassed. Public review summaries do not replace source registers. |",
            "| Lakshadweep | Pay and Accounts Office identified as bill/account custodian | Its official page describes monthly e-Lekha/PFMS accounts and annual accounts; no public project-payment export verified. |",
            "| Jammu and Kashmir | BEAMS and 2026–27 authorization order located | Allocation controls explain release and expenditure controls; they do not prove expenditure or contractor payment. Detailed AFS and public project-linked exports remain to be indexed. |",
            "| Puducherry budget | Official BEAMS exposes 2026–27 Budget at a Glance and AFS | AFS is available; granular budget download was linked through a route that timed out in this check. Broad AFS heads are not development-only figures. |",
            "| Andaman and Nicobar, Chandigarh, Dadra and Nagar Haveli and Daman and Diu | MHA territory demands and local portals mapped | Need full local accounts/budget series and links from departments to works and bills; no complete UT expenditure register yet. |",
        ]
    cag_path = ROOT / "data/acquisition/national-coverage/cag-state-accounts-manifest.json"
    if cag_path.exists():
        cag = json.loads(cag_path.read_text())
        cag_by_state = {r["state"]: r for r in cag.get("reports", [])}
        indicators_path = (
            ROOT / "data/acquisition/national-coverage/cag-state-accounts-indicators.json"
        )
        indicators = (
            json.loads(indicators_path.read_text())
            if indicators_path.exists()
            else {"snapshots": []}
        )
        indicator_by_state = {r["jurisdiction"]: r for r in indicators.get("snapshots", [])}
        indexed_statuses = {
            "indexed_candidate_rows",
            "manually_transcribed_visual_review_candidate_rows",
        }
        indexed = sum(
            1
            for r in indicators.get("snapshots", [])
            if r.get("extractionStatus") in indexed_statuses
        )
        manual_review = sum(
            1
            for r in indicators.get("snapshots", [])
            if r.get("extractionStatus") == "manual_review_required"
        )
        indexed_rows = sum(
            len(r.get("records", []))
            for r in indicators.get("snapshots", [])
            if r.get("extractionStatus") in indexed_statuses
        )
        visual_review = sum(
            1
            for r in indicators.get("snapshots", [])
            if r.get("extractionStatus") == "manually_transcribed_visual_review_candidate_rows"
        )
        out += [
            "",
            "## CAG state-account snapshot collection",
            "",
            "The CAG portal provides broad monthly account indicators, not project receipts. Many reports identify their figures as unaudited and provisional; report cutoffs differ and values may be cumulative. They remain separate from development and project-payment data, and month-to-month totals are never added.",
            "",
            f"**Collected:** {cag.get('downloadedCount', 0)} of {cag.get('stateCount', 28)} state PDFs. The latest downloadable set spans April–September 2026. A first-page index captured {indexed_rows:,} broad candidate rows in {indexed} reports, including visual transcriptions for {visual_review}; {manual_review} PDFs still need extraction review. These rows are private, unclassified and unapproved.",
            "",
            "| State | Latest report observed | PDF / extraction status |",
            "|---|---|---|",
        ]
        for name in sorted(x[0] for x in JURISDICTIONS if x[1] == "state"):
            record = cag_by_state.get(name)
            if record and record.get("downloadStatus") == "downloaded_private_unreviewed":
                label = f"{record.get('month')} {record.get('year')}"
                indexed_record = indicator_by_state.get(name, {})
                extraction = indexed_record.get("extractionStatus", "not parsed")
                count = len(indexed_record.get("records", []))
                status = (
                    f"Original preserved privately; {count} broad account rows indexed, still unreviewed"
                    if extraction
                    in {
                        "indexed_candidate_rows",
                        "manually_transcribed_visual_review_candidate_rows",
                    }
                    else f"Original preserved privately; {extraction}"
                )
                page = record.get("statePageUrl")
                display = f"[{label}]({page})" if page else label
            elif record:
                display = f"{record.get('month', '?')} {record.get('year', '')}"
                status = record.get("downloadStatus", "listed, not downloaded")
            else:
                status = cag.get("pageStatus", {}).get(name, {}).get("status", "not checked")
                display = "—"
                status = (
                    "No FY2026–27 report section was visible"
                    if status in {"no_2026_27_section", "no_2026_27_pdf_listed"}
                    else status
                )
            out.append(f"| {name} | {display} | {status} |")
    out += [
        "",
        "## Official procurement discovery routes for all jurisdictions",
        "",
        "The Government of India GePNIC/CPPP directory lists 35 jurisdictions; Ladakh is absent there. Andaman and Nicobar is listed as ePublishing only, so its separately verified administration tender portal is added as a second route. The separately verified Ladakh eProcurement portal completes the 36-jurisdiction route map. Some places have multiple department/state systems. Treat this as a source-discovery map, not a complete tender, award, or payment dataset. Search forms may require CAPTCHA; local platforms may use separate formats and access rules.",
        "",
        "| Jurisdiction | Official portal route(s) | Current evidence meaning |",
        "|---|---|---|",
    ]
    for x in data["matrix"]:
        route = x["officialProcurementPortals"]
        links = (
            ", ".join(f"[{p['platform']}]({p['url']})" for p in route["portals"])
            if route["portals"]
            else "No route"
        )
        scope = (
            "ePublishing plus separate official eProcurement portal; payment coverage unverified"
            if x["jurisdiction"] == "Andaman and Nicobar Islands"
            else "Tender discovery route identified; award/payment extraction not established"
        )
        out.append(f"| {x['jurisdiction']} | {links} | {scope} |")
    out += [
        "",
        "## First official tender leads from jurisdictions missing PMGSY partitions",
        "",
        "These are source-stage examples found on official portals. Tender value is an estimate or procurement value, not an awarded contract amount or paid amount. None is an approved Hisaab project/payment card.",
        "",
        "- **Andaman and Nicobar Islands:** the official portal lists “Improvement of village road from main road from near DWCRA to Basanti Mandir at Hasmatabad” (1.12 km), reference `EE/ZP/SA/2026-2027/05`. The listing supplies a location/work description and bid dates; no award or payment was established in this check. [Official portal](https://eprocure.andamannicobar.gov.in/).",
        "- **Dadra and Nagar Haveli:** the official tender details identify the Silvassa Smart City Phase 3 CC-road project, tender `2026_UTDNH_7964_1`, sixth call, with a tender value of ₹83,84,78,647. This is the tender value, not the winning bid, contract or payment. [Official tender detail](https://dnhtenders.gov.in/nicgep/app?component=%24DirectLink&page=FrontEndViewTender&service=direct&sp=SSJCMSmzAeuUPJjXVyioAhA%3D%3D).",
        "- **Chandigarh:** the official procurement listing includes a Sector 45/B road-berm repair tender, `2026_MCC_96192_1`, published 15 October 2026. The page exposes tender/organisation/status navigation, but no payment record was collected. [Official Chandigarh portal](https://etenders.chd.nic.in/nicgep/app).",
        "- **Delhi:** the PWD tender-status system exposes stage records; an indexed 2026 road-related tender, `2026_PWD_293115_1`, is marked cancelled. It must not be counted as an award or spend. [Official tender-status record](https://govtprocurement.delhi.gov.in/nicgep/app?component=view&page=WebTenderStatusLists&service=direct&sp=S%2BEQGrhNVpQgVOPtdkzX8fg%3D%3D).",
        "- **Ladakh:** the official portal lists named road, water, irrigation, and flood-protection works, and has tender-status/result routes. These establish a source path, not payment coverage. [Official Ladakh eProcurement](https://tenders.ladakh.gov.in/).",
        "- **Lakshadweep:** the official portal provides active, archived, cancelled/retendered, result and tender-status sections. Its search form requires CAPTCHA; no road award/payment sample was verified in this pass. [Official Lakshadweep portal](https://tendersutl.gov.in/nicgep/app).",
        "",
    ]
    out += [
        "",
        "## What this proves—and what it does not",
        "",
        "- The default MPLADS state/UT expenditure reports have been collected for all 36 jurisdictions (89,497 Lok Sabha rows and 26,286 Rajya Sabha rows). These are report rows, not unique payments; no settlement payment is approved from this collection alone.",
        "- The PMGSY dashboard produced 32 jurisdiction partitions: all 28 states plus Andaman and Nicobar Islands, Jammu and Kashmir, Ladakh, and Puducherry. Chandigarh, Dadra and Nagar Haveli and Daman and Diu, Delhi, and Lakshadweep have no PMGSY partition in the collected national response. This is a scheme-specific absence, not zero road development.",
        "- The MoRD parliamentary tables cover 28 states and six UTs for the listed scheme aggregates. Delhi and Chandigarh are absent from those tables. They do not identify named works, contractors, bill allocation, or bank settlement.",
        "- The state-development register contains 25,888 budget candidates, 465 reported-expenditure candidates, and 536 project/tender candidates across the 28 states. They remain private candidates; there are zero complete states and zero complete payment-backed cards in that register.",
        "- The eight UTs have Union Budget 2025–26/2026–27 source rows in the MHA/UT demand range (Demands 52–59), and Delhi has an additional local detailed-demand set. These are source rows, not reviewed development amounts: Delhi 57, Jammu and Kashmir 58, and Puducherry 59 are transfer demands; the other five are UT administration demand reports. No full utilization or contractor-payment connection follows from these totals.",
        "- The eight UTs still lack a consolidated, classified UT budget-and-expenditure register here. New collection adds 877 raw Union Budget lines for Demands 52–59 and 21 Puducherry monthly accounts PDFs (9,199 pages, 74,933 voucher lines) for April–September 2026. These remain private and unclassified; voucher lines are not project-linked or settlement proof. Delhi detailed demands are preserved privately (20 volumes, 547 pages; D-7 is a 127-page scan OCR-indexed in English only), but are not yet classified/reconciled as development facts.",
        "- The official GePNIC/CPPP directory and separately verified Andaman and Nicobar and Ladakh administration portals now provide procurement discovery routes for all 36 jurisdictions. This closes the portal-inventory gap only; it does not establish every jurisdiction’s tender universe or connect any tender/award to a settled payment.",
        "",
        "## Work still required in every jurisdiction",
        "",
        "1. Establish a jurisdiction-specific source inventory across Union, state/UT, local-body, and public-agency channels; map each fiscal year and reporting cutoff.",
        "2. Reconcile budget, revised budget, releases, expenditure, procurement, awards, bills, refunds, and completion evidence without adding transfers twice.",
        "3. Link project, contract, bill/payment, implementing body, recipient role, date, amount basis, and exact geography by official identifiers or documented allocations.",
        "4. Resolve publication/reuse conditions and evidence conflicts; keep absent fields unknown and publish only after explicit review.",
        "5. Use the official procurement directory to acquire jurisdiction-specific tender/award records, then obtain bill/payment data from the implementing department or treasury. Record an alternative source for the four jurisdictions absent from the collected PMGSY response; a tender lead alone does not fill that dataset.",
        "",
        "## Official source entry points",
        "",
        "- [GNCTD Finance: Detailed Demands for Grants 2026–27](https://finance.delhi.gov.in/finance/detailed-demands-grants-2026-27) — 20 volumes preserved for private review; no figures classified or approved from this new batch yet.",
        "- [Union Budget Notes on Demands for Grants 2026–27](https://www.indiabudget.gov.in/doc/eb/allsbe.pdf) — the existing private Union-budget inventory has fiscal rows for UT/MHA Demands 52–59; interpretations remain under review.",
        "- [GNCTD Finance: Budget 2026–27](https://finance.delhi.gov.in/) — budget and revised-estimate entry point.",
        "- [Puducherry Directorate of Accounts and Treasuries: monthly expenditures](https://dat.py.gov.in/expenditures) — 21 listed region/month PDFs for April–September 2026 preserved privately; three region/month combinations were not listed at retrieval. Voucher records remain unreviewed.",
        "- [Puducherry BEAMS: FY2026–27 budget documents](https://beams.py.gov.in/) — Budget at a Glance and AFS links; detailed BE document route timed out during this check.",
        "- [Ladakh Finance Department](https://ladakh.gov.in/finance-department-2/page/3/) — public finance and accounts authority information; LIFMS raw access is authenticated.",
        "- [Lakshadweep Pay and Accounts Office](https://lakshadweep.gov.in/departments-new/pay-and-accounts-office/) — official description of bill processing and monthly/annual accounts; project-linked export not verified.",
        "- [Jammu and Kashmir 2026–27 revenue-budget authorization order](https://jkgad.nic.in/common/showOrder.aspx?actCode=O45052) — explains fund authorization and accounting controls; authorization is not proof of spend.",
        "- [Goa Finance monthly expenditure reporting circular](https://www.goa.gov.in/policy_downloads/order-planning-statistics-and-evaluation/) — directs Heads of Departments to report major-head-, scheme-, and minor-head-wise monthly expenditure; the circular is not a monthly expenditure dataset.",
        "- [CAG State Accounts Report portal](https://cag.gov.in/en/state-accounts-report) — 27 of 28 latest listed FY2026–27 state snapshots preserved privately; broad provisional aggregates, not development-only or project payments.",
        "- [Official PMGSY public dashboard](https://pmgsy.dord.gov.in/dbweb) — 32 state/UT report partitions in the collected response.",
        "- [Government of India state/UT procurement portal directory (PDF)](https://eprocure.gov.in/mmp/sites/default/files/eproc/States_eProc_relatedlinks.pdf) — entry points mapped for all 36 jurisdictions; portal coverage and payment access remain unverified.",
        "- [Official MPLADS portal](https://mplads.mospi.gov.in/) — default Lok Sabha and Rajya Sabha expenditure report scopes.",
        "- [MoRD parliamentary reply on MGNREGS releases](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2288990&lang=1&reg=48), [water-work expenditure and current programme transition](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2295541&lang=2&reg=48), and [VB-G RAM-G interim allocation](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2287304&lang=1&reg=1).",
        "",
        "No source accessible in this matrix establishes every rupee of development spending or every state/UT project payment. “No partition” means not present in this collected source response; it does not mean the work or spending does not exist.",
        "",
    ]
    return "\n".join(out)


def main():
    data = build(
        load(ROOT / "data/state-development-acquisition.json"),
        load(ROOT / "data/nationwide-ingestion.json"),
        load(ROOT / "data/mplads-state-collection-assessment.json"),
        load(ROOT / "data/mplads-rajya-state-collection-assessment.json"),
        load(ROOT / "data/acquisition/national-rural-development/mord-rural-works-finance.json"),
        load(ROOT / "data/acquisition/funding-inventory/2025-2026.json"),
        load(ROOT / "data/acquisition/funding-inventory/2026-2027.json"),
    )
    target = ROOT / "data/acquisition/national-coverage"
    target.mkdir(parents=True, exist_ok=True)
    (target / "jurisdiction-matrix.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    )
    (ROOT / "docs/national-jurisdiction-coverage.md").write_text(markdown(data))
    print(
        json.dumps(
            {
                "jurisdictions": data["jurisdictionCount"],
                "complete": data["completeJurisdictions"],
                "missingPmgsy": [
                    x["jurisdiction"]
                    for x in data["matrix"]
                    if x["pmgsy"]["status"] == "not_in_source_partition"
                ],
                "publishedCards": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
