from state_development_programme_tables import (
    ap_programmes,
    assam_current_heads,
    hp_current_heads,
    cg_afs_heads,
    maharashtra_targeted_programmes,
    manipur_current_heads,
    haryana_programmes,
    karnataka_regional_programmes,
    tamil_inspected_revenue_heads,
    goa_current_heads,
    goa_demand_major_heads,
    jharkhand_crossreferenced_june_actuals,
    goa_demand_budget_summaries,
    sikkim_sic_budget_heads,
)
from state_development_inspected_accounts import inspected_accounts

"""Source-specific candidates from preserved originals; no approvals/public totals."""
import json
import re
from datetime import datetime
import calendar
import hashlib
from decimal import Decimal
from pathlib import Path
from state_development_collection import ROOT, BASE, write, now, STATES
from state_development_amounts import rupees, reference
from state_development_budget_tables import additional_budget_records
from state_development_remaining_tables import remaining_budget_records


def contractor_name(value):
    name = " ".join((value or "").split())
    return (
        None
        if name.lower() in ("", "-", "--", "na", "n/a", "nil", "not awarded", "not applicable")
        else name
    )


def ap_budget(doc, extraction):
    facts = []
    for page, groups in [
        (14, [("2025-2026", "original", 3)]),
        (15, [("2025-2026", "revised", 0), ("2026-2027", "original", 3)]),
    ]:
        lines = extraction["pages"][page - 1]["lines"]
        headings = " ".join(r["text"] for r in lines[:5])
        if "Sector-wise allocation" not in headings or "Crore" not in headings:
            raise ValueError("AP table header changed")
        for row in lines:
            m = re.match(
                r"^\s*(\d{1,2})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2}(?:\s+-?[\d,]+\.\d{2}){5})\s*$",
                row["text"],
            )
            if not m:
                continue
            number = int(m[1])
            values = m[3].split()
            for fy, edition, start in groups:
                rev, cap, total = values[start : start + 3]
                difference = (
                    Decimal(total.replace(",", ""))
                    - Decimal(rev.replace(",", ""))
                    - Decimal(cap.replace(",", ""))
                )
                facts.append(
                    {
                        "id": f"{doc['sha256']}:p{page}:sector{number}:{fy}:{edition}",
                        "stateCode": "28",
                        "financialYear": fy,
                        "purposeLabel": m[2].strip(),
                        "measure": "allocated",
                        "estimate": edition,
                        "unit": "crore",
                        "sourceRevenue": rev,
                        "sourceCapital": cap,
                        "sourceTotal": total,
                        "amountRupees": rupees(total, "crore"),
                        "revenueRupees": rupees(rev, "crore"),
                        "capitalRupees": rupees(cap, "crore"),
                        "printedArithmeticDifferenceCrore": str(difference),
                        "classification": "mixed_or_unresolved"
                        if number != 21
                        else "general_services_context",
                        "aggregation": "sector_total",
                        "origin": "state_budget_including_transfers",
                        "reviewStatus": "awaiting_review",
                        "source": reference(
                            doc,
                            f"PDF page {page}, printed page {page - 5}, sector row {number}; {edition} estimate {fy}, Revenue/Capital/Total columns",
                        ),
                        "notes": "Sector allocation includes operating expenditure and transfers. Maintenance split and development-only classification require detailed heads. Revenue plus capital must not be added again to the total. Not actual spending or a project payment.",
                    }
                )
    if len(facts) != 63:
        raise ValueError(
            "Expected 21 source sectors in each of three requested year/edition columns"
        )
    return facts


def source_projects(doc, extraction):
    rows = []
    notice_header = ["Tender Title", "Reference No", "Closing Date", "Bid Opening Date"]
    has_notice_header = any(t["rows"][0] == notice_header for t in extraction["tables"])
    for table in extraction["tables"]:
        header = table["rows"][0]
        notice_rows = table["rows"][1:]
        # NIC puts the labelled header in a parent table and the live rows in
        # an inner activeTenders table. Accept that explicit four-column layout.
        if (
            has_notice_header
            and len(header) == 4
            and re.match(r"^\d+\.\s", header[0])
            and re.match(r"^\d{2}-[A-Za-z]{3}-202[56]", header[2])
        ):
            header = notice_header
            notice_rows = table["rows"]
        if "Tender Title" in header and "Reference No" in header and "Closing Date" in header:
            columns = {v: i for i, v in enumerate(header)}
            for n, row in enumerate(notice_rows, 1):
                if len(row) != len(header):
                    continue
                rows.append(
                    {
                        "id": f"{doc['sha256']}:t{table['table']}:r{n}",
                        "stateCode": doc["stateCode"],
                        "sourceProjectId": row[columns["Reference No"]],
                        "projectIdBasis": "official_tender_reference",
                        "title": row[columns["Tender Title"]],
                        "contractorName": None,
                        "stage": "tender_notice",
                        "financialYear": None,
                        "awardDate": None,
                        "contractAmountRupees": None,
                        "paymentAmountRupees": None,
                        "sourceClosingDate": row[columns["Closing Date"]],
                        "location": None,
                        "reviewStatus": "awaiting_review",
                        "source": reference(
                            doc, f"HTML public tender table {table['table']}, row {n}"
                        ),
                        "notes": "Visible latest-notice sample only, not the full state tender register. Closing/opening dates are not award or payment dates. Year, estimate, winning bidder and exact geography require the original tender/award.",
                    }
                )
        if "Successful Bidder" in header:
            for n, row in enumerate(table["rows"][1:], 1):
                if len(row) != 4 or not row[1].isdigit():
                    continue
                rows.append(
                    {
                        "id": f"{doc['sha256']}:t{table['table']}:r{n}",
                        "stateCode": doc["stateCode"],
                        "sourceProjectId": row[1],
                        "projectIdBasis": "official_tender_id",
                        "title": row[2],
                        "contractorName": row[3],
                        "stage": "award_reported",
                        "financialYear": None,
                        "awardDate": None,
                        "contractAmountRupees": None,
                        "paymentAmountRupees": None,
                        "location": None,
                        "reviewStatus": "awaiting_review",
                        "source": reference(
                            doc, f"HTML table {table['table']}, row {n}, Tender ID {row[1]}"
                        ),
                        "notes": "Source names a successful bidder but supplies no award date/value. Do not assign to the requested two-year window until dated evidence is found.",
                    }
                )
        if "TPC (Rs. in Cr)" in header and "Name of the Contractor" in header:
            columns = {v: i for i, v in enumerate(header)}
            for n, row in enumerate(table["rows"][1:], 1):
                if len(row) != len(header):
                    continue

                def field(k):
                    return row[columns[k]].strip()

                cost = field("TPC (Rs. in Cr)")
                rows.append(
                    {
                        "id": f"{doc['sha256']}:t{table['table']}:r{n}",
                        "stateCode": doc["stateCode"],
                        "sourceProjectId": None,
                        "projectIdBasis": "source_row_only",
                        "title": field("Name of Project"),
                        "contractorName": field("Name of the Contractor") or None,
                        "stage": field("Project Status"),
                        "projectCostRupees": rupees(cost, "crore"),
                        "sourceCost": cost,
                        "costBasis": "total_project_cost",
                        "awardDateSource": field("Date of Award") or None,
                        "financialYear": None,
                        "periodEnd": None,
                        "physicalProgressSource": field(
                            "Cumulative Physical progress ( %) as Per PMIS"
                        ),
                        "financialProgressSource": field(
                            "Cumulative Financial progress (%) as Per PMIS"
                        ),
                        "paymentAmountRupees": None,
                        "location": None,
                        "reviewStatus": "awaiting_review",
                        "source": reference(doc, f"HTML table {table['table']}, source row {n}"),
                        "notes": "Agency-reported project cost and progress. Financial progress percentage is not converted into paid money. Prior-year awarded projects may be active now, but yearly spending is unavailable. Exact project identifier/alignment and reporting cutoff require further originals.",
                    }
                )
    return rows


def monthly_accounts(doc, extraction):
    if not extraction["pages"]:
        return []
    lines = extraction["pages"][0]["lines"]
    heading = " ".join(r["text"] for r in lines[:25])
    # This adapter accepts the explicit CAG overview layout only. Other layouts
    # stay in the preserved original rather than being guessed into totals.
    if not re.search(r"accounts\s+at\s+a\s+glance", heading, re.I) or not re.search(
        r"in\s+crores?", heading, re.I
    ):
        return []
    date_match = re.search(
        r"(?:end\s+of|month\s+of)\s+([A-Za-z]+)(?:\s*\([A-Za-z]+\))?[\s,-]+(202[56])", heading, re.I
    )
    period_basis = "explicit_report_month_and_calendar_year"
    if date_match:
        try:
            month = datetime.strptime(date_match[1][:3], "%b").month
        except ValueError:
            return []
        year = int(date_match[2])
        month_label = date_match[1]
    else:
        numeric_month = re.search(r"end\s+of\s+(\d{1,2})\s*,\s*(202[56])", heading, re.I)
        if numeric_month:
            month = int(numeric_month[1])
            year = int(numeric_month[2])
            month_label = calendar.month_name[month] if 1 <= month <= 12 else ""
            if not month_label:
                return []
        else:
            # Sikkim/Odisha place the fiscal year and named month in separate
            # header cells. A single explicit fiscal scope plus its month
            # establishes the calendar year without using the file name.
            fiscal = set(re.findall(r"\b(202[56])\s*-\s*(?:20)?(2[67])\b", heading))
            named = re.search(r"(?:end\s+of|Actuals\s+up\s+to)\s+([A-Za-z]+)", heading, re.I)
            if not named:
                named = re.search(
                    r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s*\((?:Pre|P|S|Sy|Sup)\)",
                    heading,
                    re.I,
                )
            if len(fiscal) != 1 or not named:
                return []
            start, end = next(iter(fiscal))
            if int(end) != int(start) % 100 + 1:
                return []
            try:
                month = datetime.strptime(named[1][:3], "%b").month
            except ValueError:
                return []
            year = int(start) + (month < 4)
            month_label = named[1]
            period_basis = "report_month_with_explicit_fiscal_scope"
    cutoff = f"{year:04}-{month:02}-{calendar.monthrange(year, month)[1]:02}"
    fy = f"{year if month >= 4 else year - 1}-{year + 1 if month >= 4 else year}"
    if fy not in ["2025-2026", "2026-2027"]:
        return []
    facts = []
    for row in lines:
        m = re.match(
            r"^\s*(?:\(?\d+[.)]?|\(?[a-zivx]+\))\s+(Revenue Expenditure|Capital Expenditure|Total Expenditure|Loans and Advances Disbursed|Sector[- ]wise Expenditure|General Sector|Social Sector|Economic Sector)\b",
            row["text"],
            re.I,
        )
        if not m:
            continue
        values = re.findall(r"-?\d[\d,]*\.\d+", row["text"])
        if len(values) != 4:
            continue
        budget, actual, percent, previous = values
        # Percentage columns check the field ordering; disagreement is retained
        # but does not turn an uncertain layout into a normalized fact.
        b = Decimal(budget.replace(",", ""))
        a = Decimal(actual.replace(",", ""))
        reported = Decimal(percent.replace(",", ""))
        if b and abs(a / b * 100 - reported) > Decimal(".10"):
            continue
        facts.append(
            {
                "id": f"{doc['sha256']}:p1:l{row['line']}",
                "stateCode": doc["stateCode"],
                "financialYear": fy,
                "purposeLabel": m[1],
                "measure": "reported_spent",
                "estimate": "not_applicable",
                "unit": "crore",
                "sourceBudget": budget,
                "sourceActual": actual,
                "amountRupees": rupees(actual, "crore"),
                "periodStart": fy[:4] + "-04-01",
                "periodEnd": cutoff,
                "periodBasis": period_basis,
                "classification": "broad_financial_context",
                "aggregation": "overview_parent",
                "reviewStatus": "awaiting_review",
                "source": reference(
                    doc,
                    f"PDF page 1, line {row['line']}; Actuals up to {month_label} {year}; source crore",
                ),
                "notes": "Source-reported booked expenditure in the CAG monthly overview. Broad expenditure, not a development-only total or individual payment. Revenue/capital, total and sector rows overlap; treat them as breakdowns, not additive payments. Monthly snapshots overlap; do not sum cumulative figures. Annual finalisation and scope/recovery definitions remain separate.",
            }
        )
    return facts


def assam_sector_expenditure(doc, extraction):
    facts = []
    account = None
    category = None
    for page in extraction["pages"]:
        heading = " ".join(r["text"] for r in page["lines"][:8])
        if "ABSTRACT REPORT OF STATE EXPENDITURE - 2025-26" not in heading and page["page"] == 1:
            raise ValueError("Assam edition changed")
        if "Lakhs" not in heading or "2025-04-01 to 2026-03-31" not in heading:
            raise ValueError("Assam fiscal scope/unit changed")
        for index, row in enumerate(page["lines"]):
            text = row["text"].strip()
            if text in ["REVENUE ACCOUNT", "CAPITAL ACCOUNT"]:
                account = text
                continue
            if re.match(r"^[A-G]\.\s", text):
                category = text
                continue
            if not re.match(r"^\([a-z]\)\s", text):
                continue
            # First four numeric columns have fixed documentary meanings:
            # original budget, revised budget, previous-year progressive spend,
            # requested-year progressive spend. Utilisation ratios follow.
            m = re.match(
                r"^\([a-z]\)\s+(.+?)\s{2,}(-?[\d,]+\.\d+\s+-?[\d,]+\.\d+\s+-?[\d,]+\.\d+\s+-?[\d,]+\.\d+)\b",
                row["text"].strip(),
            )
            if not m:
                continue
            label = m[1].strip()
            values = m[2].split()
            if index + 1 < len(page["lines"]):
                continuation = page["lines"][index + 1]["text"].strip()
                if (
                    continuation
                    and not re.search(r"\d", continuation)
                    and not re.match(r"^[A-G]\.\s|^\([a-z]\)", continuation)
                ):
                    label += " " + continuation
            facts.append(
                {
                    "id": f"{doc['sha256']}:p{page['page']}:l{row['line']}",
                    "stateCode": "18",
                    "financialYear": "2025-2026",
                    "purposeLabel": label,
                    "sourceAccount": account,
                    "sourceCategory": category,
                    "measure": "reported_spent",
                    "estimate": "not_applicable",
                    "sourceUnit": "lakh",
                    "sourceActual": values[3],
                    "sourceOriginalBudget": values[0],
                    "sourceRevisedBudget": values[1],
                    "amountRupees": rupees(values[3], "lakh"),
                    "periodStart": "2025-04-01",
                    "periodEnd": "2026-03-31",
                    "classification": "mixed_or_unresolved",
                    "reviewStatus": "awaiting_production_source_confirmation",
                    "source": reference(
                        doc,
                        f"PDF page {page['page']}, line {row['line']}; 2025–26 Progressive Expenditure column; source lakh",
                    ),
                    "notes": "Government-hosted test-labelled reporting endpoint. Confirm production provenance, posted-account completeness and reconcile control totals before publication. The requested full-year filter is not proof of complete final accounts. Includes operating expenditure; maintenance/development split requires detailed heads. No individual payment or project allocation.",
                }
            )
    return facts


def telangana_budget(doc, extraction):
    """Explicit 2026–27 brief tables; keep overlapping schemes/heads separate."""
    pages = {p["page"]: p["lines"] for p in extraction["pages"]}
    first = " ".join(r["text"] for r in pages[1])
    if not re.search(r"B\s*u\s*d\s*g\s*e\s*t\s+2026-27", first):
        raise ValueError("Telangana budget edition changed")
    facts = []

    def record(page, row, label, amount, table, **extra):
        classification = "mixed_or_unresolved"
        if "maintenance" in label.lower():
            classification = "maintenance_or_mixed_requires_review"
        if any(
            v in label.lower()
            for v in [
                "office expenses",
                "advertisements",
                "legislature secretariat",
                "general administration",
            ]
        ):
            classification = "administrative_context"
        return {
            "id": f"{doc['sha256']}:p{page}:l{row['line']}:{extra.get('financialYear', '2026-2027')}",
            "stateCode": "36",
            "financialYear": "2026-2027",
            "purposeLabel": label,
            "measure": "allocated",
            "estimate": "original",
            "unit": "crore",
            "sourceTotal": amount,
            "amountRupees": rupees(amount, "crore"),
            "classification": classification,
            "aggregation": "non_additive_budget_table_row",
            "origin": "state_budget_including_transfers",
            "reviewStatus": "awaiting_review",
            "source": reference(
                doc, f"PDF page {page}, Table {table}, line {row['line']}; source crore"
            ),
            "notes": "Scheme, department and capital-work tables overlap. Never sum them together. Includes operating expenditure and possibly Union transfers; development classification and source rights require review. Allocation is not expenditure or an individual payment.",
            **extra,
        }

    scheme_numbers = []
    for page in (15, 16, 17):
        header = " ".join(r["text"] for r in pages[page][:10])
        if not re.search(r"Table\s*-\s*10", header) or not re.search(r"2026-27", header):
            raise ValueError("Telangana scheme header changed")
        if page == 15 and not re.search(r"in\s+crore", header, re.I):
            raise ValueError("Telangana scheme unit changed")
        for index, row in enumerate(pages[page]):
            m = re.match(r"^\s*(\d{1,2})\s+(.+?)\s{2,}(\d[\d,]*)\s*$", row["text"])
            if not m:
                continue
            label = m[2].strip()
            if index + 1 < len(pages[page]):
                tail = pages[page][index + 1]["text"].strip()
                if (
                    tail
                    and not re.search(r"\d", tail)
                    and not tail.startswith(("Table", "Budget", "Sl."))
                ):
                    label += " " + tail
            scheme_numbers.append(int(m[1]))
            facts.append(
                record(page, row, label, m[3], "10", budgetTableScope="selected_scheme_allocations")
            )
    if scheme_numbers != list(range(1, 70)):
        raise ValueError("Telangana selected scheme rows changed")
    for page, table, expected in [(18, 11, 30), (19, 12, 28)]:
        header = " ".join(r["text"] for r in pages[page][:10])
        if not re.search(rf"Table\s*-\s*{table}\b", header, re.I) or not re.search(
            r"in\s+crore", header, re.I
        ):
            raise ValueError("Telangana department/capital table changed")
        if page == 18 and not all(v in header for v in ("Establishment", "Scheme", "Grand Total")):
            raise ValueError("Telangana component meanings changed")
        if page == 19 and "2026-27 B.E." not in header:
            raise ValueError("Telangana capital fiscal column changed")
        numbers = []
        for row in pages[page]:
            pattern = (
                r"^\s*(\d{1,2})\s+(.+?)\s{2,}(\d[\d,]*)\s+(\d[\d,]*)\s+(\d[\d,]*)\s*$"
                if page == 18
                else r"^\s*(\d{1,2})\s+(.+?)\s{2,}(\d[\d,]*)\s*$"
            )
            m = re.match(pattern, row["text"])
            if not m:
                continue
            numbers.append(int(m[1]))
            extra = {
                "budgetTableScope": "department_total" if page == 18 else "department_capital_works"
            }
            amount = m[5] if page == 18 else m[3]
            if page == 18:
                extra["components"] = [
                    {"label": "Establishment", "amountRupees": rupees(m[3], "crore")},
                    {"label": "Scheme", "amountRupees": rupees(m[4], "crore")},
                ]
                extra["printedArithmeticDifferenceCrore"] = str(
                    Decimal(amount.replace(",", ""))
                    - Decimal(m[3].replace(",", ""))
                    - Decimal(m[4].replace(",", ""))
                )
            facts.append(record(page, row, m[2].strip(), amount, str(table), **extra))
        if numbers != list(range(1, expected + 1)):
            raise ValueError("Telangana department/capital row count changed")
    page = 12
    header = " ".join(r["text"] for r in pages[page][:10])
    if not all(
        v in header
        for v in ("Accounts 2023-24", "Accounts 2024-25", "R.E 2025-26", "B.E 2026-27", "in Crores")
    ):
        raise ValueError("Telangana irrigation year/unit columns changed")
    irrigation = []
    for row in pages[page]:
        m = re.match(
            r"^\s*(.+?)\s{2,}(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$",
            row["text"],
        )
        if not m or m[1].strip() == "Total":
            continue
        irrigation.append(m[1].strip())
        for fy, edition, column in [("2025-2026", "revised", 4), ("2026-2027", "original", 5)]:
            facts.append(
                record(
                    page,
                    row,
                    m[1].strip(),
                    m[column],
                    "7",
                    financialYear=fy,
                    estimate=edition,
                    budgetTableScope="irrigation_subsector",
                )
            )
    if len(irrigation) != 4:
        raise ValueError("Telangana irrigation row count changed")
    return facts


def monthly_budget_context(doc, extraction):
    # Reuse only the verified overview field order, fiscal scope and crore unit.
    # The source heading says Budget Estimates; original/revised status is not
    # inferred from the month. Each report is an overlapping alternative.
    result = []
    for actual in monthly_accounts(doc, extraction):
        budget = actual.get("sourceBudget")
        if budget is None:
            continue
        result.append(
            {
                **actual,
                "id": actual["id"] + ":budget-column",
                "measure": "allocated",
                "estimate": "source_reported_budget_edition_unspecified",
                "amountRupees": rupees(budget, "crore"),
                "sourceTotal": budget,
                "budgetTableScope": "cag_overview_budget_context",
                "aggregation": "overview_parent",
                "classification": "broad_financial_context",
                "budgetEditionStatus": "original_revised_or_amended_not_stated",
                "periodEnd": actual["financialYear"][5:] + "-03-31",
                "periodBasis": "annual_budget_estimate_in_report",
                "sourceReportCutoff": actual["periodEnd"],
                "source": {
                    **actual["source"],
                    "locator": actual["source"]["locator"].split(";")[0]
                    + "; Budget Estimates column; source crore; original/revised edition not stated",
                },
                "overlapGroup": f"{doc['stateCode']}:{actual['financialYear']}:{actual['purposeLabel'].lower()}:cag_budget_context",
                "notes": "Explicit budget-estimate column in a provisional accounts overview. Not development-only or a programme ledger. Different months and original state-budget tables overlap; do not add. The report cutoff is not a payment date.",
            }
        )
    return result


def main():
    total = {"budgetCandidates": 0, "projectCandidates": 0, "expenditureCandidates": 0}
    nhidcl = {}
    master = BASE / "nhidcl-tables.json"
    if master.exists():
        original = json.loads(master.read_text())
        names = {name: code for code, name in STATES}
        for table in original["tables"]:
            for row in table[1:]:
                if len(row) != 20 or not (row[0] or "").isdigit():
                    raise ValueError("NHIDCL table schema/row changed")
                name = " ".join((row[1] or "").split()).replace(" (MMLP)", "")
                code = names.get(name)
                if not code:
                    continue  # UT records remain in the unchanged master original.

                def clean(i):
                    return " ".join((row[i] or "").split()) or None

                def date(i):
                    v = clean(i)
                    if v in (None, "-"):
                        return None
                    try:
                        return datetime.strptime(v, "%d/%m/%Y").date().isoformat()
                    except ValueError:
                        return None

                completion = date(17)
                status = clean(4)
                # The requested scope includes work active at the source cutoff
                # and reported completions during the two financial years.
                if status == "Completed" and (
                    completion is None or not "2025-04-01" <= completion <= "2026-08-31"
                ):
                    continue
                upn = re.sub(r"\s+", "", row[3] or "")
                if not upn:
                    raise ValueError("NHIDCL official project identity missing")
                record = {
                    "id": f"{original['source']['sha256']}:UPN:{upn}",
                    "stateCode": code,
                    "sourceProjectId": upn,
                    "projectIdBasis": "official_pmp_upn",
                    "title": clean(5),
                    "contractorName": contractor_name(clean(18)),
                    "contractorNameSource": clean(18),
                    "stage": status,
                    "projectCostRupees": rupees(clean(9) or "-", "crore"),
                    "sourceCost": clean(9),
                    "costBasis": "total_project_cost",
                    "contractAmountRupees": rupees(clean(10) or "-", "crore"),
                    "awardDateSource": clean(11),
                    "awardDate": date(11),
                    "reportedCompletionDate": completion,
                    "physicalProgressSource": clean(13),
                    "financialProgressSource": clean(14),
                    "financialYear": None,
                    "sourceSnapshotYear": "2026-2027",
                    "periodEnd": "2026-08-31",
                    "paymentAmountRupees": None,
                    "location": None,
                    "reviewStatus": "awaiting_review",
                    "source": reference(
                        original["source"],
                        f"PDF page 2, official UPN {upn}, table row {row[0]}; as of 31 August 2026",
                    ),
                    "notes": "Lifetime project cost and awarded contract cost, not annual expenditure. Financial progress is retained as a percentage and never multiplied into paid money. Coordinates, allocated payments and certificate-backed completion are not supplied. Completed works outside the two-year window remain only in the preserved original.",
                }
                nhidcl.setdefault(code, []).append(record)
    for checkpoint in sorted(BASE.glob("*/checkpoint.json")):
        data = json.loads(checkpoint.read_text())
        facts = []
        projects = []
        expenditure = []
        for doc in data["documents"]:
            extraction = json.loads((ROOT / doc["extraction"]).read_text())
            supplement = BASE / data["code"] / "full-text" / f"{doc['sha256']}.json"
            if supplement.exists():
                full = json.loads(supplement.read_text())
                if full["sourceSha256"] != doc["sha256"]:
                    raise ValueError("Full-text supplement changed original identity")
                extraction = {**extraction, "pages": full["pages"]}
            if doc["sourceId"] == "ap-budget-2026-glance":
                facts += ap_budget(doc, extraction)
            if doc["sourceId"] == "telangana-budget-2026-linked-1":
                facts += telangana_budget(doc, extraction)
            facts += additional_budget_records(doc, extraction)
            facts += remaining_budget_records(doc, extraction)
            facts += ap_programmes(doc, extraction)
            facts += assam_current_heads(doc, extraction)
            facts += hp_current_heads(doc, extraction)
            facts += cg_afs_heads(doc, extraction)
            facts += maharashtra_targeted_programmes(doc, extraction)
            facts += manipur_current_heads(doc, extraction)
            facts += haryana_programmes(doc, extraction)
            facts += karnataka_regional_programmes(doc, extraction)
            facts += tamil_inspected_revenue_heads(doc, extraction)
            facts += goa_current_heads(doc, extraction)
            facts += goa_demand_major_heads(doc, extraction)
            facts += goa_demand_budget_summaries(doc, extraction)
            facts += sikkim_sic_budget_heads(doc, extraction)
            expenditure += jharkhand_crossreferenced_june_actuals(doc, extraction)
            inspected_budget, inspected_actual = inspected_accounts(doc)
            facts += inspected_budget
            expenditure += inspected_actual
            if doc["sourceKind"] == "reported_expenditure":
                expenditure += monthly_accounts(doc, extraction)
                facts += monthly_budget_context(doc, extraction)
            if doc["sourceId"] == "assam-expenditure-2025":
                expenditure += assam_sector_expenditure(doc, extraction)
            if doc["sourceKind"] in (
                "projects_tenders_awards",
                "projects_contractors_progress",
                "procurement_report",
            ):
                projects += source_projects(doc, extraction)
        # A dated official-ID master edition supersedes the undated HTML row
        # suggestions for this private view; both unchanged originals remain.
        if data["code"] in nhidcl:
            projects = [p for p in projects if p["projectIdBasis"] != "source_row_only"] + nhidcl[
                data["code"]
            ]
        candidate_path = checkpoint.parent / "candidates.json"
        if candidate_path.exists():
            previous = candidate_path.read_bytes()
            previous_hash = hashlib.sha256(previous).hexdigest()
            archive = checkpoint.parent / "candidate-editions" / f"{previous_hash}.json"
            if not archive.exists():
                archive.parent.mkdir(parents=True, exist_ok=True)
                archive.write_bytes(previous)
                archive.chmod(0o600)
        identities = [r["id"] for r in facts + expenditure + projects]
        if len(identities) != len(set(identities)):
            raise ValueError(f"{data['state']}: duplicate normalized identities")
        write(
            candidate_path,
            {
                "version": "state-development-candidates/1",
                "updatedAt": now(),
                "stateCode": data["code"],
                "financialYears": ["2025-2026", "2026-2027"],
                "budgetCandidates": facts,
                "expenditureCandidates": expenditure,
                "projectCandidates": projects,
                "publication": "private_only",
                "approved": False,
            },
        )
        total["budgetCandidates"] += len(facts)
        total["projectCandidates"] += len(projects)
        total["expenditureCandidates"] += len(expenditure)
    print(json.dumps(total))


if __name__ == "__main__":
    main()
