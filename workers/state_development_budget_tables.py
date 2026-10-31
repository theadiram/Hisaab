"""Explicitly inspected fiscal table layouts, never automatic money discovery.

The source page, unit, column meanings and row coverage are checked independently
for each adapter. Parsed facts remain private; checks are not publication approval.
"""

import re
from decimal import Decimal
from state_development_amounts import rupees, reference
from state_development_collection import ROOT
import json

YEARS = [("2025-2026", "original", 1), ("2025-2026", "revised", 2), ("2026-2027", "original", 3)]
NUMBER = r"-?\d[\d,]*(?:\.\d+)?"


def record(doc, page, row, label, value, fy, edition, unit, scope, **extra):
    return {
        "id": f"{doc['sha256']}:p{page}:r{row}:{fy}:{edition}:{scope}",
        "stateCode": doc["stateCode"],
        "financialYear": fy,
        "purposeLabel": label,
        "measure": "allocated",
        "estimate": edition,
        "unit": unit,
        "sourceTotal": value,
        "amountRupees": rupees(value, unit),
        "classification": "mixed_or_unresolved",
        "aggregation": scope,
        "budgetTableScope": scope,
        "origin": "state_budget_including_transfers",
        "reviewStatus": "awaiting_review",
        "source": reference(doc, f"PDF page {page}, source row {row}; {fy} {edition}; {unit}"),
        "notes": "Budget provision, not expenditure or an individual payment. "
        "Table parents, components and other editions are alternatives or "
        "breakdowns, never additive payments. Development and maintenance "
        "scope and source reuse need explicit review.",
        **extra,
    }


def page_lines(extraction, page):
    return next(p["lines"] for p in extraction["pages"] if p["page"] == page)


def goa_glance(doc, extraction):
    lines = page_lines(extraction, 2)
    header = " ".join(r["text"] for r in lines[:12])
    if not all(s in header for s in ["lakhs", "2024-2025", "2025-2026", "2026-2027", "Revised"]):
        raise ValueError("Goa fiscal/unit columns changed")
    rows = {}
    for r in lines:
        m = re.fullmatch(
            rf"\s*(\d+)\s+(.+?)\s{{2,}}({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*",
            r["text"],
        )
        if m:
            rows[int(m[1])] = (r, m[2].strip(), list(m.groups()[2:]))
    if set(rows) != set(range(1, 22)):
        raise ValueError("Goa overview row census changed")
    # Receipts, deficits and balances are not development expenditure. Keep only
    # the explicit spending/lending rows, including debt as excluded context.
    result = []
    for n in [6, 7, 8, 15, 16, 17, 18]:
        row, label, values = rows[n]
        for fy, edition, column in YEARS:
            result.append(
                record(
                    doc,
                    2,
                    n,
                    label,
                    values[column],
                    fy,
                    edition,
                    "lakh",
                    "goa_expenditure_overview",
                    sourceRow=n,
                    classification="debt_servicing_context"
                    if n in [7, 17]
                    else "mixed_or_unresolved",
                    parentSourceRow={7: 6, 8: 6, 16: 15, 17: 15, 18: 15}.get(n),
                )
            )
    return result


def manipur_glance(doc, extraction):
    lines = page_lines(extraction, 3)
    header = " ".join(r["text"] for r in lines[:6])
    if not all(
        s in header for s in ["Rs in crore", "2024-25", "2025-26", "2026-27", "Actual", "BE", "RE"]
    ):
        raise ValueError("Manipur five fiscal columns changed")
    result = []
    observed = set()
    spending_block = False
    for row in lines:
        text = row["text"].strip()
        if text.startswith(("2. REVENUE EXPENDITURE", "5. CAPITAL EXPENDITURE")):
            spending_block = True
        elif text.startswith(("3. CAPITAL RECEIPTS", "A. TOTAL RECEIPTS")):
            spending_block = False
        if not spending_block:
            continue
        m = re.fullmatch(
            rf"\s*(2\.[1-5]|5\.[1-5]|2\.|5\.)\s+(.+?)\s{{2,}}((?:{NUMBER}|--)\s+(?:{NUMBER}|--)\s+(?:{NUMBER}|--)\s+(?:{NUMBER}|--)\s+(?:{NUMBER}|--))\s*",
            row["text"],
        )
        if not m:
            continue
        n, label, values = m[1], m[2].strip(), m[3].split()
        if n in observed:
            raise ValueError("Duplicate Manipur expenditure row")
        observed.add(n)
        # First two columns are 2024-25 RE and actual: neither belongs to 2025-26.
        for fy, edition, column in [
            ("2025-2026", "original", 2),
            ("2025-2026", "revised", 3),
            ("2026-2027", "original", 4),
        ]:
            result.append(
                record(
                    doc,
                    3,
                    n,
                    label,
                    values[column],
                    fy,
                    edition,
                    "crore",
                    "manipur_expenditure_overview",
                    sourceRow=n,
                    classification="salary_pension_context"
                    if n in ["2.1", "2.2"]
                    else "debt_servicing_context"
                    if n in ["2.3", "5.3", "5.4"]
                    else "mixed_or_unresolved",
                    parentSourceRow=None if n.endswith(".") else n.split(".")[0] + ".",
                )
            )
    if observed != {
        "2.",
        "2.1",
        "2.2",
        "2.3",
        "2.4",
        "2.5",
        "5.",
        "5.1",
        "5.2",
        "5.3",
        "5.4",
        "5.5",
    }:
        raise ValueError("Manipur expenditure row census changed")
    return result


def bihar_scheme_outlay(doc, extraction):
    lines = page_lines(extraction, 7)
    header = " ".join(r["text"] for r in lines[:6])
    if not all(s in header for s in ["Annual Scheme Outlay 2026-27", "Rs in Crore", "Percentage"]):
        raise ValueError("Bihar scheme-outlay heading changed")
    result = []
    seen = []
    for index, row in enumerate(lines):
        m = re.fullmatch(rf"\s*(\d{{1,2}})\s+(.+?)\s{{2,}}({NUMBER})\s+({NUMBER})\s*", row["text"])
        if not m:
            continue
        n = int(m[1])
        label = m[2].strip()
        if index + 1 < len(lines) and lines[index + 1]["text"].strip() == "Department":
            label += " Department"
        seen.append(n)
        result.append(
            record(
                doc,
                7,
                n,
                label,
                m[3],
                "2026-2027",
                "original",
                "crore",
                "bihar_department_scheme_outlay",
                sourceRow=n,
                sourcePercentage=m[4],
            )
        )
    if seen != list(range(1, 12)):
        raise ValueError("Bihar eleven department groups changed")
    total = next(
        (
            re.search(r"Total\s+(\d[\d,]*\.\d+)\s+100\.00", r["text"])
            for r in lines
            if re.search(r"Total\s+(\d[\d,]*\.\d+)\s+100\.00", r["text"])
        ),
        None,
    )
    if total is None:
        raise ValueError("Bihar printed control total missing")
    difference = sum(Decimal(r["sourceTotal"]) for r in result) - Decimal(total[1])
    for r in result:
        r["controlTotalRupees"] = rupees(total[1], "crore")
        r["tableControlDifferenceRupees"] = rupees(str(difference), "crore")
    return result


def haryana_sectors(doc, extraction):
    lines = page_lines(extraction, 7)
    header = " ".join(r["text"] for r in lines[:8])
    if not all(
        s in header
        for s in [
            "Table-3",
            "CONSOLIDATED FUND OF HARYANA",
            "crore",
            "2024-25",
            "2025-26",
            "2026-27",
            "(RE)",
            "(BE)",
        ]
    ):
        raise ValueError("Haryana sector scope changed")
    result = []
    seen = []
    for index, row in enumerate(lines):
        m = re.fullmatch(
            rf"\s*(\d{{1,2}})\s+(.+?)\s{{2,}}({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*", row["text"]
        )
        if not m or any("." not in m[c] for c in [3, 4, 5]):
            continue
        n = int(m[1])
        label = m[2].strip()
        seen.append(n)
        for tail in lines[index + 1 :]:
            text = tail["text"].strip()
            if re.search(r"\d", text) or text.startswith("Total"):
                break
            label += " " + text
        for fy, edition, column in [("2025-2026", "revised", 4), ("2026-2027", "original", 5)]:
            result.append(
                record(
                    doc,
                    7,
                    n,
                    label,
                    m[column],
                    fy,
                    edition,
                    "crore",
                    "haryana_sector_total",
                    sourceRow=n,
                    classification="debt_servicing_context"
                    if n in [19, 21]
                    else "pension_context"
                    if n == 20
                    else "mixed_or_unresolved",
                )
            )
    if seen != list(range(1, 23)):
        raise ValueError("Haryana 22 sectors changed")
    return result


def kerala_expenditure(doc, extraction):
    revised = doc["sourceId"] == "kerala-budget-index-linked-1"
    page = 14 if revised else 13
    lines = page_lines(extraction, page)
    header = " ".join(r["text"] for r in lines[:8])
    for required in [
        "Table A4",
        "DETAILED STATEMENT OF EXPENDITURE",
        "crore",
        "2024-25 Accounts",
        "2025-26 BE",
        "2025-26 RE",
        "Plan",
        "Non Plan",
        "Total",
    ]:
        if required not in header:
            raise ValueError("Kerala table header changed: " + required)
    if ("2026-27 RBE" if revised else "2026-27 BE") not in header:
        raise ValueError("Kerala replacement/original budget edition changed")
    result = []
    account = None
    parent = None
    for index, row in enumerate(lines):
        text = row["text"].strip()
        if text.startswith("1.Expenditure on Revenue Account"):
            account = "revenue"
        elif text.startswith("II.Expenditure on Capital Account"):
            account = "capital"
        elif text.startswith("Loan Disbursement"):
            account = "loans"
        m = re.fullmatch(rf"\s*(.+?)\s{{2,}}((?:{NUMBER}\s+){{11}}{NUMBER})\s*", row["text"])
        if not m:
            continue
        label = m[1].strip()
        values = m[2].split()
        if re.match(r"^[A-Da-c]\s+", label):
            parent = label
        child = bool(re.match(r"^\d+\s+", label))
        for tail in lines[index + 1 :]:
            txt = tail["text"].strip()
            if re.search(r"\d", txt) or re.search(r"Budget|A-4", txt):
                break
            label += " " + txt
        for fy, edition, start in [
            ("2025-2026", "original", 3),
            ("2025-2026", "revised", 6),
            ("2026-2027", "revised" if revised else "original", 9),
        ]:
            plan, nonplan, total = values[start : start + 3]
            result.append(
                record(
                    doc,
                    page,
                    row["line"],
                    label,
                    total,
                    fy,
                    edition,
                    "crore",
                    "kerala_detailed_expenditure",
                    sourceAccount=account,
                    tableHierarchy="child" if child else "parent_or_control",
                    parentSourceLabel=parent if child else None,
                    components=[
                        {"label": "Plan", "amountRupees": rupees(plan, "crore")},
                        {"label": "Non Plan", "amountRupees": rupees(nonplan, "crore")},
                    ],
                    printedArithmeticDifferenceCrore=str(
                        Decimal(total) - Decimal(plan) - Decimal(nonplan)
                    ),
                    sourceEdition="revised_budget_2026_27"
                    if revised
                    else "original_budget_2026_27",
                    classification="debt_servicing_context"
                    if "Interest payments" in label
                    else "pension_context"
                    if "Pension" in label
                    else "mixed_or_unresolved",
                )
            )
    if not result or len(result) % 3:
        raise ValueError("Kerala financial table not extracted")
    return result


def west_bengal_heads(doc, extraction):
    result = []
    for page in extraction["pages"]:
        if not 8 <= page["page"] <= 18:
            continue
        lines = page["lines"]
        header = " ".join(r["text"] for r in lines[:8])
        if not all(
            s in header
            for s in [
                "EXPENDITURE",
                "Thousand of Rupees",
                "2024-2025",
                "2025-2026",
                "2026-2027",
                "Revised Estimate",
            ]
        ):
            raise ValueError("West Bengal expenditure columns changed")
        for index, row in enumerate(lines):
            m = re.fullmatch(
                rf"\s*([23456]\d{{3}})-\s+(.+?)\s+(Voted\.\.|Charged\.\.)\s+((?:{NUMBER}|\.\.\.)\s+(?:{NUMBER}|\.\.\.)\s+(?:{NUMBER}|\.\.\.)\s+(?:{NUMBER}|\.\.\.))\s*",
                row["text"],
            )
            if not m:
                continue
            head, label, charge, vals = m.groups()
            values = vals.split()
            # Only explicit named head rows. Charge continuation and wrapped
            # head names stay in the original for separate reconstruction.
            for fy, edition, col in YEARS:
                if values[col] == "...":
                    continue
                result.append(
                    record(
                        doc,
                        page["page"],
                        row["line"],
                        label.strip(),
                        values[col],
                        fy,
                        edition,
                        "thousand",
                        "west_bengal_major_head",
                        sourceMajorHead=head,
                        sourceCharge=charge.rstrip("."),
                        sourceEdition="February 2026; interim status requires edition review",
                        classification="debt_servicing_context"
                        if head in ["2048", "2049", "6003", "6004"]
                        else "pension_context"
                        if head == "2071"
                        else "mixed_or_unresolved",
                    )
                )
    if not result:
        raise ValueError("West Bengal named expenditure heads missing")
    return result


def himachal_revenue(doc, extraction):
    lines = page_lines(extraction, 10)
    header = " ".join(r["text"] for r in lines[:5])
    if not all(
        s in header
        for s in [
            "Revenue Expenditure",
            "2024-25",
            "2025-26",
            "2026-27",
            "Crore",
            "(A)",
            "(B)",
            "(R)",
        ]
    ):
        raise ValueError("HP revenue budget header changed")
    result = []
    parent = None
    seen = []
    for index, row in enumerate(lines):
        values = re.findall(r"-?\d[\d,]*\.\d+", row["text"])
        if len(values) != 8:
            continue
        # The following line is the original English counterpart, not a
        # machine translation of the preceding legacy-font Hindi label.
        if index + 1 >= len(lines):
            raise ValueError("HP English counterpart missing")
        label = lines[index + 1]["text"].strip()
        if not re.match(r"^(?:[1-4]\.|\(\s*[a-h]\)|NET REVENUE EXPENDITURE)", label):
            raise ValueError("HP English financial row label changed")
        child = label.startswith("(")
        if not child:
            parent = label
        seen.append(label)
        for fy, edition, start in [
            ("2025-2026", "original", 2),
            ("2025-2026", "revised", 4),
            ("2026-2027", "original", 6),
        ]:
            result.append(
                record(
                    doc,
                    10,
                    row["line"],
                    label,
                    values[start],
                    fy,
                    edition,
                    "crore",
                    "himachal_net_revenue_sectors",
                    sourceAccount="revenue",
                    accountingBasis="budget_net_of_recoveries",
                    sourcePercentage=values[start + 1],
                    tableHierarchy="child" if child else "parent_or_control",
                    parentSourceLabel=parent if child else None,
                    classification="debt_servicing_context"
                    if "Debt Services" in label
                    else "mixed_or_unresolved",
                )
            )
    if len(seen) != 24 or seen[-1] != "NET REVENUE EXPENDITURE":
        raise ValueError(f"HP revenue table row census changed: {len(seen)}")
    return result


def chhattisgarh_overview(doc, extraction):
    current = doc["sourceId"] == "cg-budget-2026-linked-9"
    page = 3 if current else 5
    lines = page_lines(extraction, page)
    header = " ".join(r["text"] for r in lines[:5])
    if not all(
        s in header
        for s in (
            ["2025-26", "2026-27", "Budget Estimates", "₹ cr."]
            if current
            else ["2024-25", "2025-26", "Budget Estimates", "Growth %"]
        )
    ):
        raise ValueError("Chhattisgarh overview fiscal columns changed")
    result = []
    seen = []
    for row in lines:
        m = re.match(
            rf"^\s*([4-7])\s+(Revenue Expenditure|Capital Expenditure|Loans and Advances|Total Expenditure)\s{{2,}}({NUMBER})\s+({NUMBER})(?:\s+\d+%)?\s*$",
            row["text"],
        )
        if not m:
            continue
        n = int(m[1])
        seen.append(n)
        groups = [("2025-2026", 3), ("2026-2027", 4)] if current else [("2025-2026", 4)]
        for fy, column in groups:
            result.append(
                record(
                    doc,
                    page,
                    n,
                    m[2],
                    m[column],
                    fy,
                    "original",
                    "crore",
                    "chhattisgarh_expenditure_overview",
                    sourceRow=n,
                    sourceEdition="2026-27 highlights comparator"
                    if current and fy == "2025-2026"
                    else f"{fy} highlights",
                    editionConflict="FY2025-26 revenue provision differs by 1 crore between preserved highlights; unresolved"
                    if fy == "2025-2026" and n == 4
                    else None,
                )
            )
    if seen != [4, 5, 6, 7]:
        raise ValueError("Chhattisgarh expenditure row census changed")
    return result


def gujarat_rotated_brief(doc, extraction):
    """Inspected English rotated tables, from locally preserved OCR geometry.

    Labels and column ranges match the inspected edition. Numeric rows retain
    OCR confidence and are private candidates; no inferred actual payments.
    """
    social = [
        "Education, Sports, Art and Culture",
        "Health and Family Welfare",
        "Water Supply, Sanitation, Housing and Urban Development",
        "Information and Broadcasting",
        "Welfare of Scheduled Castes, Scheduled Tribes and Other Backward Classes",
        "Labour and Labour Welfare",
        "Social Welfare and Nutrition",
        "Others",
    ]
    economic = [
        "Agriculture and Allied Activities",
        "Rural Development",
        "Special Area Programmes",
        "Irrigation and Flood Control",
        "Energy",
        "Industry and Minerals",
        "Transport",
        "Communication",
        "Science, Technology and Environment",
        "General Economic Services",
    ]
    result = []
    for page, account in [(13, "revenue"), (15, "capital")]:
        path = ROOT / f"data/acquisition/state-development/24/budget-ocr-page-{page}.json"
        if not path.exists():
            raise FileNotFoundError(
                "Gujarat rotated-table OCR not available; preserve existing candidates and reconstruct source pages"
            )
        ocr = json.loads(path.read_text())
        if ocr["source"]["sha256"] != doc["sha256"] or ocr["source"]["pdfPage"] != page:
            raise ValueError("Gujarat OCR edition mismatch")
        texts = " ".join(r["text"] for r in ocr["rows"])
        if not all(
            s in texts
            for s in [
                "2025-26",
                "2026-27",
                "(R.E.)",
                "(B.E.)",
                "Rs. in Crore",
                "EXPENDITURE ON " + account.upper() + " ACCOUNT",
            ]
        ):
            raise ValueError("Gujarat OCR fiscal/unit headings changed")
        social_labels = (
            social
            if account == "revenue"
            else [s for s in social if s != "Labour and Labour Welfare"]
        )
        labels = (
            ["Social Services"]
            + social_labels
            + ["Economic Services"]
            + economic
            + ["Developmental expenditure total"]
        )
        for fy, edition, lo, hi in [
            ("2025-2026", "revised", 0.73, 0.84),
            ("2026-2027", "original", 0.84, 0.95),
        ]:
            amounts = sorted(
                [
                    r
                    for r in ocr["rows"]
                    if lo <= r["x"] < hi and re.fullmatch(r"\d+\.\d+", r["text"])
                ],
                key=lambda r: -r["y"],
            )
            if len(amounts) != len(labels):
                raise ValueError("Gujarat rotated numeric row count changed")
            for n, (label, value) in enumerate(zip(labels, amounts), 1):
                parent = label in [
                    "Social Services",
                    "Economic Services",
                    "Developmental expenditure total",
                ]
                result.append(
                    record(
                        doc,
                        page,
                        n,
                        label,
                        value["text"],
                        fy,
                        edition,
                        "crore",
                        "gujarat_source_development_sectors",
                        sourceAccount=account,
                        tableHierarchy="parent_or_control" if parent else "child",
                        parentSourceLabel=None
                        if parent
                        else (
                            "Social Services"
                            if n <= 1 + len(social_labels)
                            else "Economic Services"
                        ),
                        classification="source_defined_development_maintenance_split_pending",
                        extractionBasis="local_ocr_with_inspected_source_table_layout",
                        ocrConfidence=value["confidence"],
                        sourceRow=n,
                    )
                )
    return result


def meghalaya_channel_heads(doc, extraction):
    result = []
    for page in extraction["pages"]:
        if not 24 <= page["page"] <= 48:
            continue
        lines = page["lines"]
        header = " ".join(r["text"] for r in lines[:7])
        if not ("Budget Estimates 2025-26" in header and "Revised Estimates 2024-25" in header):
            continue
        if not all(
            v in header
            for v in [
                "Thousand",
                "State",
                "Centrally",
                "Sponsored",
                "Central",
                "Sector",
                "N.E.C.",
                "NLCPR",
                "EAP",
                "Total",
            ]
        ):
            raise ValueError("Meghalaya account/channel columns changed")
        for row in lines:
            m = re.search(r"\b([23456]\d{3})\s*-\s*(.+)", row["text"])
            if not m:
                continue
            fields = re.split(r"\s{2,}", m[2].strip())
            label = fields[0]
            values = " ".join(fields[1:]).split()
            if len(values) != 7 or not all(re.fullmatch(NUMBER, v) for v in values):
                continue
            components = [
                {"label": name, "amountRupees": rupees(value, "thousand")}
                for name, value in zip(
                    [
                        "State Schemes",
                        "Centrally Sponsored Schemes",
                        "Central Sector Schemes",
                        "NEC Schemes",
                        "NLCPR",
                        "Externally Aided Projects",
                    ],
                    values[:6],
                )
            ]
            difference = Decimal(rupees(values[6], "thousand")) - sum(
                Decimal(x["amountRupees"]) for x in components
            )
            result.append(
                record(
                    doc,
                    page["page"],
                    row["line"],
                    label,
                    values[6],
                    "2025-2026",
                    "original",
                    "thousand",
                    "meghalaya_major_head_channels",
                    sourceMajorHead=m[1],
                    components=components,
                    tableComponentDifferenceRupees=str(difference),
                    notes="Official 2025–26 budget provision with six scheme-channel components. "
                    "Centrally sponsored programme provision is not proof of Union-only funding, "
                    "release or payment. Charged continuations and wrapped/incomplete rows remain "
                    "in the original for review. Components are part of the total, not additional money. "
                    "Development/maintenance classification and reuse review remain pending.",
                )
            )
    if not result:
        raise ValueError("Meghalaya current-year head table not extracted")
    return result


def arunachal_heads(doc, extraction):
    """Fixed ruled AFS columns, preserving blanks and voted/charged subrows.

    Text layout loses empty capital cells. Read the inspected physical columns,
    rather than shifting six values into a guessed four-column budget template.
    """
    import pdfplumber

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for page in range(10, 22):
            p = pdf.pages[page - 1]
            words = p.extract_words()
            header = " ".join(w["text"] for w in words if w["top"] < 160)
            if not all(
                s in header
                for s in ["thousand", "2024-25", "2025-26", "2026-27", "Revenue", "Capital"]
            ):
                raise ValueError(f"Arunachal page {page} columns changed")
            # Inspected rules: head 359–405; label 405–575; charge 575–612.
            # BE25 Revenue/Capital 176–221 / 222–267;
            # RE25 268–313 / 314–359; BE26 613–658 / 659–704; total 705–750.
            heads = [
                w
                for w in words
                if w["top"] > 155
                and 359.5 <= (w["x0"] + w["x1"]) / 2 < 405.5
                and re.fullmatch(r"[2456]\d{3}", w["text"])
            ]
            for head_word in heads:
                # Only same-baseline, single-row heads are accepted here.
                # Multiline labels and centred voted/charged rows need a
                # separate document reconstruction; never carry a nearby head.
                band = [w for w in words if abs(w["top"] - head_word["top"]) < 0.75]

                def cell(lo, hi):
                    return " ".join(
                        w["text"]
                        for w in sorted(band, key=lambda w: w["x0"])
                        if lo <= (w["x0"] + w["x1"]) / 2 < hi
                    )

                major = head_word["text"]
                purpose = cell(405.5, 570)
                charge = cell(570, 612.3)
                if not purpose:
                    continue
                account = "revenue" if major.startswith("2") else "capital"
                group = charge or "unspecified"
                for fy, edition, rev_bounds, cap_bounds, total_bounds in [
                    ("2025-2026", "original", (175.6, 221.6), (221.6, 267.6), None),
                    ("2025-2026", "revised", (267.6, 313.6), (313.6, 359.5), None),
                    ("2026-2027", "original", (612.3, 658.2), (658.2, 704.2), (704.2, 751)),
                ]:
                    value = cell(*(rev_bounds if account == "revenue" else cap_bounds))
                    total = cell(*total_bounds) if total_bounds else None
                    # A printed total zero is explicit; an empty historic cell
                    # remains missing and creates no fabricated zero record.
                    if not value and total == "0":
                        value = "0"
                    if not re.fullmatch(NUMBER, value):
                        continue
                    if total and total != value:
                        raise ValueError(f"Arunachal head {major} current account/total conflict")
                    result.append(
                        record(
                            doc,
                            page,
                            f"{major}:{group}:{head_word['top']:.2f}",
                            purpose,
                            value,
                            fy,
                            edition,
                            "thousand",
                            "arunachal_major_head",
                            sourceMajorHead=major,
                            sourceCharge=group,
                            sourceAccount=account,
                            classification="debt_servicing_context"
                            if major in ["2048", "2049", "6003", "6004"]
                            else "mixed_or_unresolved",
                        )
                    )
    if not result:
        raise ValueError("Arunachal expenditure heads not extracted")
    return result


def assam_major_heads(doc, extraction):
    """Only explicitly named, same-line heads; no prior-year cells inferred."""
    heading = " ".join(r["text"] for r in page_lines(extraction, 1)[:12])
    if not all(
        t in heading
        for t in ["STATEMENT OF EXPENDITURE", "2025-26", "Rupees in Lakhs", "2023-24", "2024-25"]
    ):
        raise ValueError("Assam expenditure edition/unit changed")
    result = []
    for page in extraction["pages"]:
        for row in page["lines"]:
            m = re.search(
                rf"\b([246]\d{{3}})\s+([A-Za-z].*?)\s{{2,}}((?:{NUMBER}\s+)*{NUMBER})\s*$",
                row["text"],
            )
            if not m:
                continue
            values = m[3].split()
            # General / Sixth Schedule / total are components of one amount.
            # Blank components are not replaced with zero. Total is explicit.
            if len(values) not in [2, 3]:
                continue
            result.append(
                record(
                    doc,
                    page["page"],
                    row["line"],
                    m[2].strip(),
                    values[-1],
                    "2025-2026",
                    "original",
                    "lakh",
                    "assam_named_major_head",
                    sourceMajorHead=m[1],
                    sourceAccount="revenue" if m[1].startswith("2") else "capital_or_loans",
                    sourceEdition="FY2025–26 original; test-labelled official hostname requires production confirmation",
                    sourceComponentValues=values[:-1],
                    labelScope="same-line official label; wrapped continuation requires review",
                    classification="debt_servicing_context"
                    if m[1] in ["2048", "2049", "6003", "6004"]
                    else "mixed_or_unresolved",
                )
            )
    if len(result) != 318:
        raise ValueError("Assam accepted same-line head census changed")
    return result


def nagaland_major_heads(doc, extraction):
    result = []
    census = set()
    for n in range(6, 12):
        lines = page_lines(extraction, n)
        heading = " ".join(r["text"] for r in lines[:6])
        if not all(
            t in heading
            for t in [
                "DISBURSEMENT",
                "Lakhs of Rupees",
                "2024-2025",
                "2025-2026",
                "2026-2027",
                "Accounts",
                "Revised",
            ]
        ):
            raise ValueError("Nagaland expenditure fiscal/unit columns changed")
        for row in lines:
            m = re.fullmatch(
                rf"\s*([2467]\d{{3}})\s+(.+?)\s{{2,}}({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*",
                row["text"],
            )
            if not m:
                continue
            head, label = m[1], m[2].strip()
            if head in census:
                raise ValueError("Nagaland duplicate named expenditure head")
            census.add(head)
            for fy, edition, column in YEARS:
                result.append(
                    record(
                        doc,
                        n,
                        head,
                        label,
                        m.groups()[2:][column],
                        fy,
                        edition,
                        "lakh",
                        "nagaland_named_major_head",
                        sourceMajorHead=head,
                        sourceAccount="revenue" if n <= 8 else "capital_or_loans",
                        sourceEdition="26 March 2026 original financial statement",
                        classification="debt_servicing_context"
                        if head in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                    )
                )
    if not result:
        raise ValueError("Nagaland named expenditure heads unavailable")
    return result


def tripura_demand_heads(doc, extraction):
    path = ROOT / "data/acquisition/state-development/16/demand-summary-pages.json"
    full = json.loads(path.read_text())
    if (
        full["sourceSha256"] != doc["sha256"]
        or full["totalPages"] != 859
        or not full.get("completeInspection")
    ):
        raise ValueError("Tripura full-volume summary source changed")
    result = []
    demands = set()
    for page in full["pages"]:
        lines = page["lines"]
        header = " ".join(r["text"] for r in lines[:14])
        demand = re.search(r"DEMAND NO\s*:-\s*(\d+)", header)
        if not demand or not all(
            t in header
            for t in ["31st March, 2026", "Amount in Lakhs", "2023-24", "2024-25", "2025-26"]
        ):
            raise ValueError("Tripura demand summary fiscal/unit columns changed")
        number = int(demand[1])
        demands.add(number)
        for row in lines:
            m = re.fullmatch(
                rf"\s*([24567]\d{{3}})\s+(.+?)\s{{2,}}({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*",
                row["text"],
            )
            if not m:
                continue
            result.append(
                record(
                    doc,
                    page["page"],
                    f"{number}:{m[1]}:{row['line']}",
                    m[2].strip(),
                    m[6],
                    "2025-2026",
                    "original",
                    "lakh",
                    "tripura_demand_major_head",
                    sourceDemand=number,
                    sourceMajorHead=m[1],
                    labelScope="same-line official label; wrapped continuation requires review",
                    sourceEdition="FY2025–26 original; demand summaries inspected across all 859 pages",
                    classification="debt_servicing_context"
                    if m[1] in ["2048", "2049", "6003", "6004"]
                    else "mixed_or_unresolved",
                )
            )
    if demands != set(range(1, 68)) or len(result) != 295:
        raise ValueError("Tripura demand/accepted head census changed")
    return result


def odisha_programme_ceiling(doc, extraction):
    path = ROOT / "data/acquisition/state-development/21/brief-p31-ocr.json"
    ocr = json.loads(path.read_text())
    if ocr.get("sourceSha256") != doc["sha256"] or ocr.get("page") != 31:
        raise ValueError("Odisha inspected OCR source changed")
    header = " ".join(r["text"] for r in ocr["rows"])
    if not all(
        t in header for t in ["ANNUAL CEILING FOR PROGRAMME EXPENDITURE", "2026-27", "Crore"]
    ):
        raise ValueError("Odisha programme ceiling heading/unit changed")
    # Inspected original page, table 1.21. The OCR reads row 33's 5400.00
    # as "$400.00"; only this recorded visual transcription is accepted.
    labels = [
        ("06", "Commerce Department"),
        ("34", "Co-operation Department"),
        ("23", "Department of Agriculture and Farmers’ Empowerment"),
        ("41", "Department of Social Security & Empowerment of Persons with Disability"),
        ("36", "Department of Women & Child Development"),
        ("42", "Disaster Management"),
        ("37", "Electronics & Information Technology Department"),
        ("30", "Energy Department"),
        ("26", "Excise Department"),
        ("05", "Finance Department"),
        ("33", "Fisheries & Animal Resources Development Department"),
        ("09", "Food Supplies and Consumer Welfare Department"),
        ("22", "Forest, Environment and Climate Change Department"),
        ("02", "General Administration and Public Grievance Department"),
        ("31", "Handlooms, Textiles & Handicrafts Department"),
        ("12", "Health and Family Welfare Department"),
        ("38", "Higher Education Department"),
        ("01", "Home Department"),
        ("13", "Housing and Urban Development Department"),
        ("19", "Industries Department"),
        ("25", "Information & Public Relations Department"),
        ("14", "Labour & Employees’ State Insurance Department"),
        ("04", "Law Department"),
        ("40", "Micro, Small & Medium Enterprises Department"),
        ("44", "Mission Shakti Department"),
        ("43", "Odia Language, Literature and Culture Department"),
        ("17", "Panchayati Raj and Drinking Water Department"),
        ("29", "Parliamentary Affairs Department"),
        ("16", "Planning and Convergence Department"),
        ("35", "Public Enterprises Department"),
        ("03", "Revenue and Disaster Management Department"),
        ("28", "Rural Development Department"),
        (
            "11",
            "Scheduled Tribes & Scheduled Castes Development, Minorities & Backward Classes Welfare Department",
        ),
        ("10", "School and Mass Education Department"),
        ("27", "Science & Technology Department"),
        ("39", "Skill Development & Technical Education Department"),
        ("15", "Sports & Youth Services Department"),
        ("24", "Steel & Mines Department"),
        ("32", "Tourism Department"),
        ("21", "Transport Department"),
        ("20", "Water Resources Department"),
        ("07", "Works Department"),
    ]
    values = sorted(
        [r for r in ocr["rows"] if r["x"] > 0.75 and 0.19 < r["y"] < 0.82], key=lambda r: -r["y"]
    )
    if len(values) != 42:
        raise ValueError("Odisha departmental ceiling row census changed")
    result = []
    for n, ((demand, label), row) in enumerate(zip(labels, values), 1):
        raw = row["text"]
        value = "5400.00" if n == 33 and raw == "$400.00" else raw
        if not re.fullmatch(NUMBER, value):
            raise ValueError("Unverified Odisha OCR monetary token")
        result.append(
            record(
                doc,
                31,
                n,
                label,
                value,
                "2026-2027",
                "original",
                "crore",
                "odisha_department_programme_ceiling",
                sourceDemand=demand,
                sourceTable="1.21 section A; excludes separately listed PSU/off-budget section B",
                extractionBasis="local OCR compared with original source image; labels visually transcribed",
                sourceOCRToken=raw,
                sourceOCRConfidence=row["confidence"],
                sourceEdition="FY2026–27 original",
                classification="source_defined_programme_maintenance_split_pending",
            )
        )
    difference = sum(Decimal(r["amountRupees"]) for r in result) - Decimal(
        rupees("180000.00", "crore")
    )
    for r in result:
        r["tableControlDifferenceRupees"] = str(difference)
        r["conflictStatus"] = (
            "table_control_difference_requires_review" if difference else "none_observed"
        )
    return result


def maharashtra_rural_heads(doc, extraction):
    result = []
    for page in [3, 4]:
        lines = page_lines(extraction, page)
        header = " ".join(r["text"] for r in lines[:9])
        if not all(
            t in header
            for t in [
                "Rural Development Department",
                "Rs. in Thousands",
                "2024-2025",
                "2025-2026",
                "2026-2027",
                "Revised Estimates",
            ]
        ):
            raise ValueError("Maharashtra rural department fiscal/unit layout changed")
        for row in lines:
            m = re.match(
                rf"\s*([24567]\d{{3}}),\s+(.+?)\s+(Charged|Voted)\s+({NUMBER}|\.\.)\s+({NUMBER}|\.\.)\s+({NUMBER}|\.\.)\s+({NUMBER}|\.\.)(?:\s|$)",
                row["text"],
            )
            if not m:
                continue
            for fy, edition, column in YEARS:
                value = m.groups()[3:][column]
                result.append(
                    record(
                        doc,
                        page,
                        f"{m[1]}:{m[3]}",
                        m[2].strip(),
                        value if value != ".." else "--",
                        fy,
                        edition,
                        "thousand",
                        "maharashtra_rural_named_major_head",
                        sourceMajorHead=m[1],
                        sourceCharge=m[3],
                        sourceDepartment="Rural Development Department",
                        sourceAccount="revenue" if page == 3 else "capital_or_loans",
                        sourceEdition="FY2026–27 civil budget; FY2025–26 original/revised comparators",
                        labelScope="same-line named head only; wrapped heads and charge continuations not inferred",
                        classification="debt_servicing_context"
                        if m[1] == "2049"
                        else "mixed_or_unresolved",
                    )
                )
    if not result:
        raise ValueError("Maharashtra rural named heads unavailable")
    return result


def additional_budget_records(doc, extraction):
    adapters = {
        "mh-rural-budget-linked-1": maharashtra_rural_heads,
        "tripura-budget-2025": tripura_demand_heads,
        "odisha-budget-index-linked-2": odisha_programme_ceiling,
        "assam-observed-38-afs": assam_major_heads,
        "nagaland-afs-2026": nagaland_major_heads,
        "goa-budget-alternative-linked-4": goa_glance,
        "manipur-budget-2026": manipur_glance,
        "bihar-budget-2026": bihar_scheme_outlay,
        "arunachal-afs-2026": arunachal_heads,
        "haryana-budget-glance": haryana_sectors,
        "kerala-budget-index-linked-1": kerala_expenditure,
        "kerala-budget-index-linked-7": kerala_expenditure,
        "wb-budget-afs": west_bengal_heads,
        "hp-budget-brief-official-2026": himachal_revenue,
        "cg-budget-2026-linked-9": chhattisgarh_overview,
        "cg-budget-2025-linked-10": chhattisgarh_overview,
        "gujarat-budget-observed-2": gujarat_rotated_brief,
        "meghalaya-budget-2025": meghalaya_channel_heads,
    }
    adapter = adapters.get(doc["sourceId"])
    return adapter(doc, extraction) if adapter else []
