"""Inspected official layouts for the remaining state budget extraction gaps.

Amounts remain private review candidates. No current budget is inferred from
historical actuals, a speech promise, receipt, or a fiscal projection.
"""

import re
import json
from decimal import Decimal
from state_development_budget_tables import record, page_lines, NUMBER
from state_development_collection import ROOT


def jharkhand_heads(doc, extraction):
    result = []
    for p in extraction["pages"]:
        n = p["page"]
        if n not in list(range(10, 17)) + list(range(19, 25)):
            continue
        header = " ".join(r["text"] for r in p["lines"][:17])
        if not all(
            x in header for x in ["Expenditure", "2024-25", "2025-26", "2026-27", "Lakh of Rupees"]
        ):
            raise ValueError("Jharkhand expenditure fiscal/unit layout changed")
        for row in p["lines"]:
            m = re.fullmatch(
                rf"\s*([A-Za-z].*?)\s+([234567]\d{{3}})\s+((?:{NUMBER}\s+){{7}}{NUMBER})\s*",
                row["text"],
            )
            if not m:
                continue
            label, head, values = m[1].strip(), m[2], m[3].split()
            components = dict(
                zip(
                    [
                        "establishment",
                        "state_scheme_with_state_share",
                        "centrally_sponsored_scheme",
                        "central_assistance_union_share",
                    ],
                    values[3:7],
                )
            )
            difference = sum(Decimal(v.replace(",", "")) for v in values[3:7]) - Decimal(
                values[7].replace(",", "")
            )
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 7),
            ]:
                result.append(
                    record(
                        doc,
                        n,
                        f"{head}:{row['line']}",
                        label,
                        values[column],
                        fy,
                        edition,
                        "lakh",
                        "jharkhand_named_major_head",
                        sourceMajorHead=head,
                        sourceAccount="revenue" if n <= 16 else "capital_debt_or_loans",
                        sourceEdition="24 February 2026 financial statement",
                        sourceComponents=components if fy == "2026-2027" else None,
                        componentDifferenceSourceUnit=str(difference)
                        if fy == "2026-2027"
                        else None,
                        labelScope="same-line English label; wrapped continuation requires review",
                        classification="debt_servicing_context"
                        if head in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                    )
                )
    if len(result) != 345:
        raise ValueError("Jharkhand accepted expenditure head census changed")
    return result


def karnataka_heads(doc, extraction):
    result = []
    for n in range(17, 26):
        lines = page_lines(extraction, n)
        header = " ".join(r["text"] for r in lines[:9])
        if not all(
            t in header
            for t in ["STATEMENT 1 -", "DISBURSEMENT", "in Lakhs", "2024-25", "2025-26", "2026-27"]
        ):
            raise ValueError("Karnataka expenditure fiscal/unit layout changed")
        for row in lines:
            m = re.fullmatch(
                rf"\s*([24567]\d{{3}})\s+(.*?)\s{{2,}}({NUMBER}|\.{{2,3}})\s+({NUMBER}|\.{{2,3}})\s+({NUMBER}|\.{{2,3}})\s+({NUMBER}|\.{{2,3}})\s*",
                row["text"],
            )
            if not m:
                continue
            label = re.search(r"([A-Za-z][A-Za-z/,&.() -]+)\s*$", m[2])
            if not label:
                continue
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                value = m.groups()[2:][column]
                result.append(
                    record(
                        doc,
                        n,
                        f"{m[1]}:{row['line']}",
                        label[1].strip(),
                        "--" if value.startswith(".") else value,
                        fy,
                        edition,
                        "lakh",
                        "karnataka_named_major_head",
                        sourceMajorHead=m[1],
                        sourceAccount="revenue" if n <= 21 else "capital_debt_or_loans",
                        labelScope="same-line English label; wrapped continuation requires review",
                        sourceEdition="FY2026–27 original financial statement",
                        classification="debt_servicing_context"
                        if m[1] in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                    )
                )
    if len(result) != 315:
        raise ValueError("Karnataka accepted expenditure head census changed")
    return result


def uttarakhand_grants(doc, extraction):
    import pdfplumber

    result = []
    grants = set()
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in [4, 5]:
            header = " ".join(r["text"] for r in page_lines(extraction, n)[:8])
            if "Amount in Thousand" not in header or (
                n == 4 and "Budget 2026-27 Grantwise" not in header
            ):
                raise ValueError("Uttarakhand grant/unit heading changed")
            tables = pdf.pages[n - 1].extract_tables()
            if len(tables) != 1:
                raise ValueError("Uttarakhand grant table geometry changed")
            for row in tables[0]:
                if len(row) != 4 or not row[0]:
                    continue
                match = re.match(r"^(\d{2})\s", row[0])
                if not match:
                    continue
                number = int(match[1])
                label = " ".join(line.strip() for line in row[0].splitlines()[1:])
                if not label or not re.fullmatch(r"\d+", row[3] or ""):
                    raise ValueError("Uttarakhand English grant label/total missing")
                if number in grants:
                    raise ValueError("Uttarakhand duplicate grant")
                grants.add(number)
                components = []
                for cell in row[1:3]:
                    values = re.findall(r"\d+|--", cell or "")
                    if len(values) != 2:
                        raise ValueError("Uttarakhand voted/charged cells changed")
                    components.extend(values)
                result.append(
                    record(
                        doc,
                        n,
                        number,
                        label,
                        row[3],
                        "2026-2027",
                        "original",
                        "thousand",
                        "uttarakhand_grant_total",
                        sourceDemand=number,
                        sourceRevenueVoted=components[0],
                        sourceRevenueCharged=components[1],
                        sourceCapitalVoted=components[2],
                        sourceCapitalCharged=components[3],
                        sourceEdition="FY2026–27 original grantwise provision",
                        notes="Printed grant total in thousands of rupees; includes revenue, capital and charged/debt context. Dash components remain unavailable, not invented zeros. No programme/payment completeness or development-only total is implied.",
                    )
                )
    if grants != set(range(1, 32)):
        raise ValueError("Uttarakhand 31-grant census changed")
    return result


def mizoram_demands(doc, extraction):
    import pdfplumber

    result = []
    demands = set()
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in [4, 5]:
            page = pdf.pages[n - 1]
            heading = page.extract_text() or ""
            if not all(
                t in heading
                for t in ["SCHEDULE OF DEMAND AND APPROPRIATION FOR THE YEAR 2025-26", "in lakh"]
            ):
                raise ValueError("Mizoram demand edition/unit changed")
            tables = page.extract_tables()
            if len(tables) != 1:
                raise ValueError("Mizoram demand table geometry changed")
            current = None
            for row in tables[0][5:]:
                if len(row) != 9:
                    raise ValueError("Mizoram demand column count changed")
                if row[0] and re.fullmatch(r"\d+\.", row[0]):
                    current = (int(row[0].strip(".")), row[1])
                    demands.add(current[0])
                elif not (row[0] is None and row[1] is None and row[2] == "Voted" and current):
                    current = None
                    continue
                if not current or row[2] not in ["Voted", "Charged"]:
                    continue
                number, label = current
                value = row[7] or "--"
                if value != "--" and not re.fullmatch(NUMBER, value):
                    raise ValueError("Mizoram demand amount token changed")
                result.append(
                    record(
                        doc,
                        n,
                        f"{number}:{row[2]}",
                        label,
                        value,
                        "2025-2026",
                        "original",
                        "lakh",
                        "mizoram_department_demand_charge",
                        sourceDemand=number,
                        sourceCharge=row[2],
                        sourceRevenueState=row[3],
                        sourceRevenueCSSOther=row[4],
                        sourceCapitalState=row[5],
                        sourceCapitalCSSOther=row[6],
                        sourceEdition="FY2025–26 original demand and appropriation schedule",
                        notes="Department demand charge/vote subdivision, not a unique programme or payment. CSS/Other columns do not establish Union-only share. Empty cells stay missing. Debt, administration and operating expenditure require exclusion or classification.",
                    )
                )
    if demands != set(range(1, 50)):
        raise ValueError("Mizoram 49-demand census changed")
    return result


def rajasthan_outcome_schemes(doc, extraction):
    table_source = json.loads(
        (ROOT / "data/acquisition/state-development/8/outcome-tables.json").read_text()
    )
    if table_source["sourceSha256"] != doc["sha256"] or not table_source.get("completeInspection"):
        raise ValueError("Rajasthan outcome table inspection incomplete or wrong edition")
    result = []
    for page in table_source["pages"]:
        department = None
        bfc = None
        for table in page["tables"]:
            if not table or len(table[0]) != 15:
                continue
            for r in table:
                if r[0] == "Admin":
                    department = next((v.removeprefix(":-").strip() for v in r[1:] if v), "")
                if r[0] == "BFC Name":
                    bfc = next((v.removeprefix(":-").strip() for v in r[1:] if v), "")
            header = " ".join(v for r in table[:5] for v in r if v)
            if not all(
                t in header for t in ["Financial Outlay", "2026-2027", "crores", "State", "Total"]
            ):
                continue
            if not department or not bfc:
                raise ValueError("Rajasthan scheme department/BFC missing")
            for ordinal, r in enumerate(table[5:], 6):
                if not r[0] or not re.fullmatch(r"\d+", r[0].strip()) or not r[1]:
                    continue
                values = [(v or "").strip() for v in r[4:7]]
                state, central, total = values
                label = " ".join(r[1].splitlines())
                difference = (
                    (
                        Decimal(total.replace(",", ""))
                        - Decimal(state.replace(",", ""))
                        - Decimal(central.replace(",", ""))
                    )
                    if all(re.fullmatch(NUMBER, v) for v in values)
                    else None
                )
                result.append(
                    record(
                        doc,
                        page["page"],
                        f"{r[0]}:{ordinal}",
                        label,
                        total if re.fullmatch(NUMBER, total) else "--",
                        "2026-2027",
                        "original",
                        "crore",
                        "rajasthan_department_outcome_scheme",
                        sourceDepartment=department,
                        sourceBFC=bfc,
                        sourceSchemeSerial=r[0],
                        sourceStateFund=state,
                        sourceCentralAssistance=central,
                        sourceRawTotal=total,
                        componentDifferenceSourceUnit=str(difference)
                        if difference is not None
                        else None,
                        sourceEdition="FY2026–27 output outcome budget",
                        sourceOutput=r[7],
                        sourceIndicator=r[8],
                        sourcePhysicalTarget=r[9],
                        overlapGroup=f"rajasthan:2026-2027:{department}:{bfc}:{r[0]}",
                        notes="Programme financial outlay, not release, expenditure or settlement. State and central columns are components, not amounts to add again to total. Merged continuation/target rows without their own explicit scheme and funding cells are skipped. Source-defined welfare/development scope still requires maintenance and administrative review.",
                    )
                )
    if not result:
        raise ValueError("Rajasthan explicit scheme outlays unavailable")
    return result


def madhya_pradesh_major_schemes(doc, extraction):
    folder = ROOT / "data/acquisition/state-development/23" / ("ocr-" + doc["sha256"])
    cp = json.loads((folder / "checkpoint.json").read_text())
    if cp.get("sourceSha256") != doc["sha256"] or not cp.get("completeInspection"):
        raise ValueError("Madhya Pradesh OCR inspection incomplete/wrong source")
    result = []
    ranges = {
        29: (1, 15),
        30: (16, 35),
        31: (36, 55),
        32: (56, 74),
        33: (75, 93),
        34: (94, 113),
        35: (114, 127),
    }
    for page, (start, end) in ranges.items():
        ocr = json.loads((folder / f"p{page}.json").read_text())
        if ocr.get("sourceSha256") != doc["sha256"] or ocr.get("page") != page:
            raise ValueError("Madhya Pradesh OCR page identity changed")
        rows = ocr["rows"]
        if page == 29 and not all(
            t in " ".join(r["text"] for r in rows)
            for t in ["Provision for Major Schemes FY 2026-27", "crore"]
        ):
            raise ValueError("Madhya Pradesh scheme year/unit changed")
        amounts = sorted(
            [r for r in rows if 0.74 < r["x"] < 0.86 and re.fullmatch(r"\d[\d,]*", r["text"])],
            key=lambda r: -r["y"],
        )
        if len(amounts) != end - start + 1:
            raise ValueError("Madhya Pradesh scheme monetary row census changed")
        for i, amount in enumerate(amounts):
            serial = start + i
            high = amount["y"] + amount["height"] + 0.007
            low = (
                amounts[i + 1]["y"] + amounts[i + 1]["height"] + 0.005
                if i + 1 < len(amounts)
                else 0.07
            )
            text_rows = sorted(
                [r for r in rows if 0.19 < r["x"] < 0.71 and low < r["y"] < high],
                key=lambda r: -r["y"],
            )
            label = " ".join(r["text"] for r in text_rows)
            if not label:
                raise ValueError("Madhya Pradesh scheme label missing")
            # The inspected original prints continuous serials 1–127. Vision
            # omitted serials 3 and 5 on page 29; these are visual transcriptions,
            # not IDs inferred from a project name or geographic proximity.
            result.append(
                record(
                    doc,
                    page,
                    serial,
                    label,
                    amount["text"],
                    "2026-2027",
                    "original",
                    "crore",
                    "mp_major_scheme_provision",
                    sourceSchemeSerial=serial,
                    sourceEdition="FY2026–27 Mera Budget major-scheme provisions",
                    extractionBasis="local OCR with inspected original pages 29–35",
                    sourceOCRConfidence=amount["confidence"],
                    classification="maintenance_context"
                    if serial in [101, 106]
                    else "debt_servicing_context"
                    if serial in [13, 30, 63, 86]
                    else "administrative_context"
                    if serial in [5, 34, 40, 67, 91, 121, 124]
                    else "mixed_or_unresolved",
                    notes="Official current-year scheme provision, not a transfer made, expenditure or contractor payment. Source serial is local to this publication, not a stable project ID. Department summaries, scheme rows and transfers overlap and cannot be summed together.",
                )
            )
    return result


def punjab_heads(doc, extraction):
    result = []
    for n in range(14, 30):
        lines = page_lines(extraction, n)
        header = " ".join(r["text"] for r in lines[:11])
        if not all(
            t in header
            for t in ["DISBURSEMENT", "in thousands", "2024-2025", "2025-2026", "2026-2027"]
        ):
            raise ValueError("Punjab expenditure fiscal/unit layout changed")
        for row in lines:
            m = re.fullmatch(
                r"\s*([234567]\d{3})\s+(.+?)\s{2,}([\d,]+|\.\.)\s+([\d,]+|\.\.)\s+([\d,]+|\.\.)\s+([\d,]+|\.\.)\s*",
                row["text"],
            )
            if not m:
                continue
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                value = m.groups()[2:][column]
                result.append(
                    record(
                        doc,
                        n,
                        f"{m[1]}:{row['line']}",
                        m[2].strip(),
                        value if value != ".." else "--",
                        fy,
                        edition,
                        "thousand",
                        "punjab_named_major_head",
                        sourceMajorHead=m[1],
                        sourceAccount="revenue" if n <= 24 else "capital_debt_or_loans",
                        sourceEdition="FY2026–27 original financial statement",
                        classification="debt_servicing_context"
                        if m[1] in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                    )
                )
    if len(result) != 330:
        raise ValueError("Punjab accepted expenditure head census changed")
    return result


def mizoram_current_heads(doc, extraction):
    result = []
    for n in list(range(8, 14)) + list(range(15, 19)):
        lines = page_lines(extraction, n)
        header = " ".join(r["text"] for r in lines[:6])
        if not all(
            t in header for t in ["DISBURSEMENTS", "in lakh", "2024-25", "2025-26", "2026-27"]
        ):
            raise ValueError("Mizoram current expenditure fiscal/unit layout changed")
        for row in lines:
            m = re.fullmatch(
                r"\s*(-?\d[\d,]*\.\d{2})\s+(-?\d[\d,]*\.\d{2})\s+(-?\d[\d,]*\.\d{2})\s+([234567]\d{3})\s*-\s*(.*?)\s{2,}(-?\d[\d,]*\.\d{2})\s*",
                row["text"],
            )
            if not m:
                continue
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 5),
            ]:
                result.append(
                    record(
                        doc,
                        n,
                        f"{m[4]}:{row['line']}",
                        m[5].strip(),
                        m.groups()[column],
                        fy,
                        edition,
                        "lakh",
                        "mizoram_named_major_head",
                        sourceMajorHead=m[4],
                        sourceAccount="revenue" if n <= 13 else "capital_debt_or_loans",
                        sourceEdition="FY2026–27 original financial statement",
                        classification="debt_servicing_context"
                        if m[4] in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                    )
                )
    if len(result) != 276:
        raise ValueError("Mizoram current accepted expenditure head census changed")
    return result


def uttar_pradesh_objects(doc, extraction):
    result = []
    translations = {
        1: "Salaries",
        2: "Wages",
        3: "Dearness allowance",
        4: "Travel expenses",
        5: "Transfer travel expenses",
        6: "Other allowances",
        7: "Honorarium",
        8: "Office expenses",
        9: "Electricity expenses",
        10: "Water charges",
        11: "Stationery and printing",
        12: "Office furniture and equipment",
        13: "Telephone expenses",
        14: "Purchase of motor vehicles",
        15: "Vehicle maintenance and fuel",
        16: "Payment for professional and special services",
        17: "Rent, rates and royalties",
        18: "Publication",
        19: "Advertising and publicity",
        20: "General grants in aid excluding salary",
        21: "Scholarships and stipends",
        22: "Hospitality expenses",
        23: "Secret service expenses",
        24: "Major construction works",
        25: "Minor construction works",
        26: "Machinery, equipment and plant",
        27: "Subsidies",
        28: "Interdepartmental works",
        29: "Maintenance",
        30: "Investment or loans",
    }
    for n in range(8, 14):
        lines = page_lines(extraction, n)
        header = " ".join(r["text"] for r in lines[:12])
        if not all(t in header for t in ["2026-2027", "2025-2026", "2024-2025", "₹"]):
            raise ValueError("Uttar Pradesh object-table year/unit heading changed")
        basis = "gross" if n <= 10 else "net"
        for row in lines:
            m = re.fullmatch(
                rf"\s*(\d{{2}})\s*-\s*(.*?)\s{{2,}}({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s+({NUMBER})\s*",
                row["text"],
            )
            if not m:
                continue
            number = int(m[1])
            label = translations.get(
                number, f"Standard object {number}; see original-language label"
            )
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                result.append(
                    record(
                        doc,
                        n,
                        f"{m[1]}:{row['line']}",
                        label,
                        m.groups()[2:][column],
                        fy,
                        edition,
                        "lakh",
                        "up_standard_object_" + basis,
                        sourceStandardObject=m[1],
                        sourceAmountBasis=basis,
                        sourceOriginalLabel=m[2],
                        labelTranslationReviewStatus="draft_original_page_translation",
                        sourceEdition="FY2026–27 original objectwise memorandum",
                        classification="administrative_context"
                        if number in [1, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 18, 19, 22, 23]
                        else "maintenance_context"
                        if number in [15, 29]
                        else "mixed_or_unresolved",
                        notes="Statewide standard-object provision in lakhs, not a named project or payment. Gross and net are alternatives; current and revised editions are alternatives. Only explicitly numbered rows are normalized; unlabeled account continuations remain an extraction gap.",
                    )
                )
    if len(result) != 324:
        raise ValueError("Uttar Pradesh accepted object-row census changed")
    return result


def tamil_nadu_agriculture_outlay(doc, extraction):
    import pdfplumber

    current = doc["sourceId"].endswith("linked-3")
    pages = [94, 95] if current else [62]
    fy = "2026-2027" if current else "2025-2026"
    edition = "revised" if current else "original"
    result = []
    serials = set()
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in pages:
            text = pdf.pages[n - 1].extract_text() or ""
            if (
                "Thousands" not in text
                or ("RBE 2026-2027" if current else "BE 2025-26") not in text
            ):
                raise ValueError("Tamil Nadu agriculture fiscal/unit heading changed")
            tables = pdf.pages[n - 1].extract_tables()
            if len(tables) != 1:
                raise ValueError("Tamil Nadu agriculture table geometry changed")
            for r in tables[0]:
                if not r[0] or not re.fullmatch(r"\d+", r[0]):
                    continue
                number = int(r[0])
                serials.add(number)
                expected = 5 if current else 6
                if len(r) != expected:
                    raise ValueError("Tamil Nadu agriculture column count changed")
                capital, revenue, total = r[-3:]
                if not re.fullmatch(NUMBER, total or ""):
                    raise ValueError("Tamil Nadu agriculture total missing")
                result.append(
                    record(
                        doc,
                        n,
                        number,
                        " ".join(r[1].splitlines()),
                        total,
                        fy,
                        edition,
                        "thousand",
                        "tn_agriculture_allied_outlay",
                        sourceRow=number,
                        sourceCapital=capital,
                        sourceRevenue=revenue,
                        sourceEdition="RBE2026–27" if current else "BE2025–26",
                        notes="Department/sector portion in the agriculture and allied annexure, not every department’s entire budget. Ellipsis components stay unknown. Original and revised budget editions are alternatives; no payment is implied. Transfers, maintenance and broader departmental overlap require explicit review.",
                    )
                )
    if serials != set(range(1, 21)):
        raise ValueError("Tamil Nadu agriculture 20-row census changed")
    return result


def bihar_ocr_heads(doc, extraction):
    folder = ROOT / "data/acquisition/state-development/10" / ("ocr-" + doc["sha256"])
    cp = json.loads((folder / "checkpoint.json").read_text())
    if cp.get("sourceSha256") != doc["sha256"] or not cp.get("completeInspection"):
        raise ValueError("Bihar financial-statement OCR inspection incomplete")
    result = []
    heads = 0
    for page in list(range(8, 13)) + list(range(14, 17)):
        ocr = json.loads((folder / f"p{page}.json").read_text())
        rows = ocr["rows"]
        if ocr.get("sourceSha256") != doc["sha256"] or ocr.get("page") != page:
            raise ValueError("Bihar OCR page source changed")
        heading = " ".join(r["text"] for r in rows)
        if "DISBURSEMENTS" not in heading:
            raise ValueError("Bihar disbursement section changed")
        if page == 8 and not all(
            t in heading for t in ["Lacs of Rupees", "2024-2025", "2025-2026", "2026-2027"]
        ):
            raise ValueError("Bihar OCR fiscal/unit header changed")
        for h in rows:
            if not (
                0.465 < h["x"] < 0.51
                and h["y"] < 0.83
                and re.fullmatch(r"[234567]\d{3}", h["text"])
            ):
                continue
            heads += 1
            center = h["y"] + h["height"] / 2
            labels = [
                r
                for r in rows
                if 0.245 < r["x"] < 0.455
                and r["x"] + r["width"] < 0.474
                and r["y"] - 0.005 < center < r["y"] + r["height"] + 0.01
                and re.search("[A-Za-z]", r["text"])
            ]
            label = (
                " ".join(r["text"] for r in sorted(labels, key=lambda r: -r["y"]))
                if labels
                else "Source major head " + h["text"]
            )
            for fy, edition, bounds in [
                ("2025-2026", "original", (0.64, 0.745)),
                ("2025-2026", "revised", (0.747, 0.853)),
                ("2026-2027", "original", (0.855, 0.97)),
            ]:
                cells = [
                    r
                    for r in rows
                    if bounds[0] < r["x"] + r["width"] / 2 < bounds[1]
                    and abs(r["y"] + r["height"] / 2 - center) < 0.008
                    and re.fullmatch(r"-?\d[\d,]*\.\d{2}", r["text"])
                ]
                value = cells[0]["text"] if len(cells) == 1 else "--"
                result.append(
                    record(
                        doc,
                        page,
                        f"{h['text']}:{h['y']:.6f}",
                        label,
                        value,
                        fy,
                        edition,
                        "lakh",
                        "bihar_ocr_named_major_head",
                        sourceMajorHead=h["text"],
                        sourceAccount="revenue" if page <= 12 else "capital_debt_or_loans",
                        sourceEdition="FY2026–27 original financial statement",
                        sourceOCRMoneyConfidence=cells[0]["confidence"]
                        if len(cells) == 1
                        else None,
                        extractionBasis="local OCR, inspected table layouts; individual original monetary cells await review",
                        labelScope="OCR English label; unavailable labels retain official head code only",
                        classification="debt_servicing_context"
                        if h["text"] in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                        notes="OCR candidate, not an approved figure. Units/fiscal columns are anchored to the original table. Missing/ambiguous numeric cells remain unknown. Original-image amount review, rights and overlap reconciliation are required before publication.",
                    )
                )
    if heads != 120:
        raise ValueError("Bihar accepted OCR head census changed")
    return result


def meghalaya_current_heads(doc, extraction):
    import pdfplumber

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in range(17, 37):
            page = pdf.pages[n - 1]
            header = page.extract_text() or ""
            if not all(t in header for t in ["thousand", "2024-2025", "2025-2026", "2026-2027"]):
                raise ValueError("Meghalaya current financial columns changed")
            tables = page.extract_tables()
            if len(tables) != 1 or len(tables[0][0]) != 5:
                raise ValueError("Meghalaya five-column geometry changed")
            charge_parent = None
            for ordinal, r in enumerate(tables[0], 1):
                label = " ".join((r[3] or "").splitlines())
                m = re.match(r"([234567]\d{3})\s*-\s*(.+)", label)
                charge = None
                parent_row = None
                if m:
                    if not any((r[i] or "").strip() for i in [0, 1, 2, 4]):
                        charge_parent = (m[1], m[2], ordinal)
                        continue
                    charge_parent = None
                elif label.strip() in ["(Voted)", "(Charged)"] and charge_parent:
                    code, name, parent_row = charge_parent
                    charge = label.strip("()")
                    m = re.match(r"([234567]\d{3})-(.+)", code + "-" + name)
                else:
                    charge_parent = None
                    continue
                # Named physical cells only. Separate voted/charged continuation
                # rows are deliberately not assigned a preceding head by guess.
                for fy, edition, column in [
                    ("2025-2026", "original", 1),
                    ("2025-2026", "revised", 2),
                    ("2026-2027", "original", 4),
                ]:
                    value = (r[column] or "").strip()
                    if value and not re.fullmatch(NUMBER, value):
                        continue
                    result.append(
                        record(
                            doc,
                            n,
                            ordinal,
                            m[2],
                            value or "--",
                            fy,
                            edition,
                            "thousand",
                            "meghalaya_current_named_heads",
                            sourceMajorHead=m[1],
                            sourceCharge=charge,
                            sourceParentRow=parent_row,
                            sourceAccount="revenue" if n < 29 else "capital_debt_or_loans",
                            notes="Named expenditure-head row, or explicit Voted/Charged row directly grouped under an unfunded named heading in the same physical table. Blank original cells stay unknown. Unanchored charge/vote continuations are not assigned a parent. Department and scheme presentations overlap. Not a payment or a complete development total.",
                        )
                    )
    if not result:
        raise ValueError("Meghalaya named heads unavailable")
    return result


def tripura_current_heads(doc, extraction):
    import pdfplumber

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in range(24, 46):
            page = pdf.pages[n - 1]
            header = page.extract_text() or ""
            if not all(t in header for t in ["EXPENDITURE", "Lakhs", "2025-26", "2026-27"]):
                raise ValueError("Tripura expenditure fiscal/unit heading changed")
            words = page.extract_words()
            width = page.width
            heads = [
                w
                for w in words
                if 0.43 < w["x0"] / width < 0.49 and re.fullmatch(r"[234567]\d{3}", w["text"])
            ]
            for h in heads:
                baseline = (h["top"] + h["bottom"]) / 2
                line = [w for w in words if abs((w["top"] + w["bottom"]) / 2 - baseline) < 2]
                values = [w for w in line if re.fullmatch(r"-?\d+\.\d{4}", w["text"])]
                # Original source uses four physical numeric columns. Recovery
                # and net follow on distinct rows and are never added here.
                if len(values) != 4:
                    continue
                values.sort(key=lambda w: w["x0"])
                if not (
                    all(w["x0"] < h["x0"] for w in values[:3]) and values[3]["x0"] / width > 0.82
                ):
                    continue
                label = (
                    " ".join(
                        w["text"]
                        for w in sorted(line, key=lambda w: w["x0"])
                        if w["x0"] > h["x1"] and w["x1"] < values[3]["x0"]
                    )
                    .lstrip("- ")
                    .strip()
                )
                if not label:
                    continue
                for fy, edition, column in [
                    ("2025-2026", "original", 1),
                    ("2025-2026", "revised", 2),
                    ("2026-2027", "original", 3),
                ]:
                    result.append(
                        record(
                            doc,
                            n,
                            f"{h['text']}:{h['top']:.3f}",
                            label,
                            values[column]["text"],
                            fy,
                            edition,
                            "lakh",
                            "tripura_current_gross_heads",
                            sourceMajorHead=h["text"],
                            amountBasis="gross_before_separately_reported_recoveries",
                            notes="Named same-line gross expenditure head. Wrapped labels are partial; blank or ambiguous monetary rows are skipped. Separate recovery/net rows remain in the original and must be reconciled before a net total. Not payments or development-only spending.",
                        )
                    )
    if not result:
        raise ValueError("Tripura current expenditure heads unavailable")
    return result


def gujarat_outcome_schemes(doc, extraction):
    table_source = json.loads(
        (ROOT / "data/acquisition/state-development/24/outcome-tables.json").read_text()
    )
    if table_source.get("sourceSha256") != doc["sha256"] or not table_source.get(
        "completeInspection"
    ):
        raise ValueError("Gujarat outcome table inspection incomplete or wrong source")
    result = []
    for page in table_source["pages"]:
        for ti, table in enumerate(page["tables"], 1):
            if not table or len(table[0]) != 7:
                continue
            header = " ".join(v for r in table[:2] for v in r if v)
            if not all(
                t in header for t in ["Name of Scheme", "Financial", "2026-27", "Crore", "Physical"]
            ):
                continue
            for ordinal, r in enumerate(table[2:], 3):
                if len(r) != 7 or not r[1] or r[1].strip().lower() == "total":
                    continue
                label = " ".join(r[1].splitlines())
                value = (r[2] or "").strip()
                if not value or not re.fullmatch(NUMBER, value):
                    continue
                heads = re.findall(r"\b\d{3}\s+\d{4}\s+\d{2}\s+\d{3}\s+\d{2}\b", label)
                result.append(
                    record(
                        doc,
                        page["page"],
                        f"t{ti}:{ordinal}",
                        label,
                        value,
                        "2026-2027",
                        "original",
                        "crore",
                        "gujarat_outcome_scheme_subdivision",
                        sourceSchemeType=r[0],
                        sourceBudgetHeads=[" ".join(h.split()) for h in heads],
                        sourceOutputUnit=r[3],
                        sourcePhysicalTargetCurrentYear=r[4],
                        sourcePhysicalTargetNextYear=r[5],
                        sourcePhysicalTargetFollowingYear=r[6],
                        sourceEdition="FY2026–27 outcome budget",
                        labelScope="Named source cell only; merged/blank-name continuation rows not inherited",
                        overlapGroup=(
                            "gujarat:2026-2027:" + ":".join(" ".join(h.split()) for h in heads)
                        )
                        if heads
                        else None,
                        notes="Current-year programme/subdivision provision, not a payment or exact project. Physical targets for later years are not financial allocations. General/SCSP/TASP rows and multiple budget heads require overlap review. Missing names/amounts and continuation rows are not guessed. State/Central share labels do not establish actual releases.",
                    )
                )
    if not result:
        raise ValueError("Gujarat named outcome schemes unavailable")
    return result


def remaining_budget_records(doc, extraction):
    adapters = {
        "gujarat-budget-observed-4": gujarat_outcome_schemes,
        "meghalaya-afs-observed-2026": meghalaya_current_heads,
        "tripura-afs-observed-2026": tripura_current_heads,
        "bihar-afs-observed-2026": bihar_ocr_heads,
        "tn-agriculture-budget-index-linked-2": tamil_nadu_agriculture_outlay,
        "tn-agriculture-budget-index-linked-3": tamil_nadu_agriculture_outlay,
        "up-demands-2026": uttar_pradesh_objects,
        "punjab-afs-observed-2026": punjab_heads,
        "mizoram-afs-observed-2026": mizoram_current_heads,
        "mp-mera-budget-observed-2026": madhya_pradesh_major_schemes,
        "mizoram-demands-observed-2025": mizoram_demands,
        "rajasthan-outcome-2026": rajasthan_outcome_schemes,
        "uk-budget-index-linked-2": uttarakhand_grants,
        "ka-budget-volumes-observed-2026-linked-2": karnataka_heads,
        "jharkhand-budget-index-linked-3": jharkhand_heads,
    }
    fn = adapters.get(doc["sourceId"])
    return fn(doc, extraction) if fn else []
