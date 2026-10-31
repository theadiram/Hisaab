"""Private transcription of two visually inspected scanned CAG overview pages.

The immutable source checksum anchors each transcription. This is broad provisional
accounting context, never development-only spending or individual settlement.
"""

from state_development_amounts import rupees, reference

SOURCES = {
    "cag-monthly-17-linked-3": (
        "17",
        "4bfc2e127c61b3cb50ac607b9d50bb2fd787d8a4d9cd2d406ac0cf3874f45f05",
        [
            ("4", "Revenue expenditure", "21812.39", "3486.69", "broad_financial_context"),
            ("4b", "Interest payments", "1539.72", "339.94", "debt_servicing_context"),
            ("4c", "Salaries and wages", "4995.30", "1243.25", "salary_pension_context"),
            ("4d", "Pension expenditure", "1980.36", "568.39", "salary_pension_context"),
            ("4e", "Subsidy expenditure", "173.00", "0.00", "mixed_or_unresolved"),
            ("5", "Capital expenditure", "7439.10", "225.38", "broad_financial_context"),
            (
                "7",
                "Total expenditure excluding loans advanced",
                "29251.49",
                "3712.07",
                "broad_financial_context",
            ),
            ("8", "Loans and advances disbursed", "41.00", "0.00", "broad_financial_context"),
        ],
    ),
    "cag-monthly-5-linked-2": (
        "5",
        "2e272e75d37c23a6b98000e80184cc465ff876ce8be00aaf718ffba7fd6ee549",
        [
            ("4", "Revenue expenditure", "64989.44", "13487.21", "broad_financial_context"),
            ("4b", "Interest payments", "7929.40", "1093.64", "debt_servicing_context"),
            ("4c", "Salaries and wages", "19479.76", "4764.63", "salary_pension_context"),
            ("4d", "Pension expenditure", "11131.50", "3793.12", "salary_pension_context"),
            ("4e", "Subsidy expenditure", "748.10", "27.78", "mixed_or_unresolved"),
            ("5", "Capital expenditure", "14742.97", "1246.70", "broad_financial_context"),
            (
                "7",
                "Total expenditure excluding loans advanced",
                "79732.41",
                "14733.91",
                "broad_financial_context",
            ),
            ("8", "Loans and advances disbursed", "400.41", "82.48", "broad_financial_context"),
        ],
    ),
}


def inspected_accounts(doc):
    fixture = SOURCES.get(doc["sourceId"])
    if not fixture:
        return [], []
    code, sha, lines = fixture
    if doc["stateCode"] != code or doc["sha256"] != sha:
        raise ValueError("Inspected account source edition changed")
    budget = []
    actuals = []
    for number, label, provision, actual, classification in lines:
        common = {
            "stateCode": code,
            "financialYear": "2026-2027",
            "purposeLabel": label,
            "unit": "crore",
            "classification": classification,
            "periodStart": "2026-04-01",
            "sourceReportCutoff": "2026-06-30",
            "sourceBudget": provision,
            "sourceActual": actual,
            "extractionBasis": "manually transcribed from visually inspected immutable original page 1",
            "reviewStatus": "awaiting_review",
            "publicationApproved": False,
            "notes": "Unaudited provisional government accounts. Overview totals, components and monthly snapshots overlap. Budget is not actuals; actuals are not contractor payments. Includes non-development expenditure. Source reuse and owner review remain pending.",
        }
        actuals.append(
            {
                **common,
                "id": f"{sha}:p1:r{number}:actual",
                "measure": "reported_spent",
                "amountRupees": rupees(actual, "crore"),
                "periodEnd": "2026-06-30",
                "accountingBasis": "provisional_booked_expenditure",
                "source": reference(
                    doc, f"Original PDF page 1, row {number}; Actuals up to June 2026; crore"
                ),
            }
        )
        budget.append(
            {
                **common,
                "id": f"{sha}:p1:r{number}:budget",
                "measure": "allocated",
                "amountRupees": rupees(provision, "crore"),
                "periodEnd": "2027-03-31",
                "estimate": "original"
                if code == "5"
                else "source_reported_budget_edition_unspecified",
                "budgetTableScope": "cag_overview_budget_context",
                "aggregation": "cag_overview_budget_context",
                "overlapGroup": f"{code}:2026-2027:{label.lower()}:cag_budget_context",
                "source": reference(
                    doc,
                    f"Original PDF page 1, row {number}; Budget Estimates 2026–27 column; crore; "
                    + ("Org as printed" if code == "5" else "original/revised edition not stated"),
                ),
            }
        )
    return budget, actuals
