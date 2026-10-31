"""Private checks of candidate identities, controls and overlapping scopes.

Matching arithmetic does not establish publication rights, complete coverage,
payment settlement, or a project connection. No totals are published here.
"""

import json
import re
from decimal import Decimal
from collections import Counter
from state_development_collection import BASE, ROOT, STATES, now, write
from state_development_amounts import rupees


def table_check(rows, expected, unit, label):
    values = [r.get("amountRupees") for r in rows]
    known = all(v is not None for v in values)
    calculated = sum((Decimal(v) for v in values), Decimal(0)) if known else None
    printed = Decimal(rupees(expected, unit))
    difference = calculated - printed if calculated is not None else None
    return {
        "label": label,
        "rows": len(rows),
        "printedControlRupees": str(printed),
        "calculatedRupees": str(calculated) if calculated is not None else None,
        "differenceRupees": str(difference) if difference is not None else None,
        "status": "missing_component_requires_review"
        if difference is None
        else "matched"
        if difference == 0
        else "difference_requires_review",
        "isDevelopmentTotal": False,
        "publicationApproved": False,
    }


def rounding_context(control, unit, decimals):
    quantum = Decimal(rupees("1", unit)) * (Decimal(10) ** -decimals)
    bound = (Decimal(control["rows"]) + 1) * quantum / 2
    difference = control["differenceRupees"]
    return {
        **control,
        "printedPrecisionDecimals": decimals,
        "roundingEnvelopeRupees": str(bound),
        "compatibleWithDisplayRounding": abs(Decimal(difference)) <= bound
        if difference is not None
        else None,
        "roundingStatus": "Compatibility only; unrounded source values or official correction still required. No amount changed.",
    }


def checks(code, rows, documents):
    result = []

    def group(fy, estimate, scope):
        return [
            r
            for r in rows
            if r["financialYear"] == fy
            and r["estimate"] == estimate
            and r.get("budgetTableScope", r.get("aggregation")) == scope
        ]

    def doc(source):
        receipt = next(d for d in documents if d["sourceId"] == source)
        return json.loads((ROOT / receipt["extraction"]).read_text())

    if code == "5":
        selected = group("2026-2027", "original", "uttarakhand_grant_total")
        if selected:
            result.append(
                table_check(
                    selected,
                    "1117032109",
                    "thousand",
                    "Uttarakhand 31-grant printed control, includes debt and non-development",
                )
            )
    if code == "28":
        extraction = doc("ap-budget-2026-glance")
        for page, fy, estimate, column in [
            (14, "2025-2026", "original", 5),
            (15, "2025-2026", "revised", 2),
            (15, "2026-2027", "original", 5),
        ]:
            lines = next(p["lines"] for p in extraction["pages"] if p["page"] == page)
            total = next(r["text"] for r in lines if "Grand Total" in r["text"])
            values = re.findall(r"-?\d[\d,]*\.\d+", total)
            if len(values) != 6:
                raise ValueError("AP control total changed")
            result.append(
                table_check(
                    group(fy, estimate, "sector_total"),
                    values[column],
                    "crore",
                    f"{fy} {estimate}, AP 21-sector total",
                )
            )
    if code == "36":
        extraction = doc("telangana-budget-2026-linked-1")
        for page, scope, label in [
            (18, "department_total", "30 department totals"),
            (19, "department_capital_works", "28 capital-work departments"),
        ]:
            lines = next(p["lines"] for p in extraction["pages"] if p["page"] == page)
            total = next(r["text"] for r in lines if re.match(r"^\s*(?:Grand )?Total\s", r["text"]))
            values = re.findall(r"\d[\d,]*", total)
            result.append(
                table_check(
                    group("2026-2027", "original", scope),
                    values[-1],
                    "crore",
                    f"2026–27 {label}; overlapping tables kept separate",
                )
            )
    if code == "10":
        scheme_rows = [
            r for r in rows if r.get("budgetTableScope") == "bihar_department_scheme_outlay"
        ]
        if scheme_rows:
            expected = scheme_rows[0]["controlTotalRupees"]
            result.append(
                table_check(
                    scheme_rows, expected, "rupee", "Bihar eleven annual scheme-outlay groups"
                )
            )
    if code == "6":
        extraction = doc("haryana-budget-glance")
        lines = next(p["lines"] for p in extraction["pages"] if p["page"] == 7)
        total = next(r["text"] for r in lines if re.match(r"^\s*Total\s", r["text"]))
        values = re.findall(r"\d[\d,]*\.\d+", total)
        if len(values) != 3:
            raise ValueError("Haryana control total changed")
        for fy, edition, column in [("2025-2026", "revised", 1), ("2026-2027", "original", 2)]:
            result.append(
                table_check(
                    group(fy, edition, "haryana_sector_total"),
                    values[column],
                    "crore",
                    f"{fy} {edition}: Haryana 22 department/sector groups",
                )
            )
    if code == "24":
        for fy, edition in [("2025-2026", "revised"), ("2026-2027", "original")]:
            for account in ["revenue", "capital"]:
                selected = [
                    r
                    for r in group(fy, edition, "gujarat_source_development_sectors")
                    if r["sourceAccount"] == account
                ]
                if not selected:
                    continue
                parents = {
                    r["purposeLabel"]: r
                    for r in selected
                    if r["tableHierarchy"] == "parent_or_control"
                }
                for name in ["Social Services", "Economic Services"]:
                    children = [r for r in selected if r.get("parentSourceLabel") == name]
                    result.append(
                        table_check(
                            children,
                            parents[name]["sourceTotal"],
                            "crore",
                            f"{fy} {account}: {name} children",
                        )
                    )
                result.append(
                    table_check(
                        [parents["Social Services"], parents["Economic Services"]],
                        parents["Developmental expenditure total"]["sourceTotal"],
                        "crore",
                        f"{fy} {account}: source-defined developmental total; maintenance scope unresolved",
                    )
                )
    if code == "21":
        g = group("2026-2027", "original", "odisha_department_programme_ceiling")
        if g:
            result.append(
                table_check(
                    g,
                    "180000.00",
                    "crore",
                    "42 department programme ceilings; source-defined scope, excluding PSUs/off-budget",
                )
            )
    for code_scope, relations in [
        ("goa_expenditure_overview", [(6, [7, 8]), (15, [16, 17, 18])]),
        (
            "manipur_expenditure_overview",
            [
                ("2.", ["2.1", "2.2", "2.3", "2.4", "2.5"]),
                ("5.", ["5.1", "5.2", "5.3", "5.4", "5.5"]),
            ],
        ),
    ]:
        for fy, estimate in [
            ("2025-2026", "original"),
            ("2025-2026", "revised"),
            ("2026-2027", "original"),
        ]:
            g = group(fy, estimate, code_scope)
            if not g:
                continue
            by_row = {r["sourceRow"]: r for r in g}
            for parent, children in relations:
                row = by_row[parent]
                result.append(
                    table_check(
                        [by_row[c] for c in children],
                        row["sourceTotal"],
                        row["unit"],
                        f"{fy} {estimate}: {row['purposeLabel']} component check",
                    )
                )
    if code in ["28", "21", "36"]:
        result = [rounding_context(r, "crore", 0 if code == "36" else 2) for r in result]
    return result


def main():
    summary = []
    for code, name in STATES:
        folder = BASE / code
        file = folder / "candidates.json"
        if not file.exists():
            continue
        data = json.loads(file.read_text())
        cp = json.loads((folder / "checkpoint.json").read_text())
        all_rows = sum(
            (data[k] for k in ["budgetCandidates", "expenditureCandidates", "projectCandidates"]),
            [],
        )
        duplicates = [key for key, n in Counter(r["id"] for r in all_rows).items() if n > 1]
        if duplicates:
            raise ValueError(f"{name}: duplicate candidate identities")
        controls = checks(code, data["budgetCandidates"], cp["documents"])
        periods = []
        for fy in ["2025-2026", "2026-2027"]:
            budgets = [r for r in data["budgetCandidates"] if r["financialYear"] == fy]
            expenditure = [r for r in data["expenditureCandidates"] if r["financialYear"] == fy]
            periods.append(
                {
                    "financialYear": fy,
                    "budgetCandidates": len(budgets),
                    "reportedExpenditureCandidates": len(expenditure),
                    "latestExpenditureCutoff": max(
                        (r["periodEnd"] for r in expenditure), default=None
                    ),
                    "reconciledCompleteStateRegister": False,
                }
            )
        overlapping = {}
        for row in data["budgetCandidates"]:
            if row.get("overlapGroup"):
                overlapping.setdefault(row["overlapGroup"], []).append(row)
        report = {
            "version": "state-reconciliation/1",
            "stateCode": code,
            "state": name,
            "checkedAt": now(),
            "identityCheck": "unique",
            "financialYears": periods,
            "tableControls": controls,
            "overlapGroups": [
                {
                    "key": key,
                    "records": len(group),
                    "status": "requires_explicit_edition_or_component_review",
                    "publicationApproved": False,
                }
                for key, group in overlapping.items()
                if len(group) > 1
            ],
            "classificationCounts": dict(
                Counter(r.get("classification", "unclassified") for r in all_rows)
            ),
            "scopeWarnings": [
                "Budget editions are alternatives, not additive.",
                "Programme, department and capital-work tables overlap.",
                "Cumulative monthly expenditure snapshots overlap.",
                "Project cost and contract award are not annual payments.",
            ],
            "completeCoverage": False,
            "publicationApproved": False,
            "remaining": [
                "Detailed development/maintenance classification",
                "Official authority/programme register denominator",
                "Source rights and explicit owner evidence decisions",
                "Missing project allocations and payment evidence",
            ],
        }
        write(folder / "reconciliation.json", report)
        summary.append(report)
    write(
        BASE / "reconciliation-summary.json",
        {
            "checkedAt": now(),
            "statesChecked": len(summary),
            "statesWithBudgetCandidates": sum(
                any(y["budgetCandidates"] for y in r["financialYears"]) for r in summary
            ),
            "completeStates": 0,
            "states": summary,
        },
    )
    print(
        json.dumps(
            {
                "statesChecked": len(summary),
                "completeStates": 0,
                "controlChecks": sum(len(r["tableControls"]) for r in summary),
                "controlDifferences": sum(
                    c["status"] == "difference_requires_review"
                    for r in summary
                    for c in r["tableControls"]
                ),
                "missingComponents": sum(
                    c["status"] == "missing_component_requires_review"
                    for r in summary
                    for c in r["tableControls"]
                ),
            }
        )
    )


if __name__ == "__main__":
    main()
