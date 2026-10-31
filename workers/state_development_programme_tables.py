"""Private programme evidence from explicitly inspected state demand layouts.

Never joins projects or payments using a programme name. Printed subhead paths are
source-local accounting context, not globally resolved programme identifiers.
"""

import re
import json
from state_development_budget_tables import record, NUMBER


def ap_programmes(doc, extraction):
    if not (doc["stateCode"] == "28" and "/Volume-III-" in doc["url"]):
        return []
    result = []
    major = None
    minor = None
    group = None
    submajor = None
    named = {}
    demand = None
    for page in extraction["pages"]:
        group = None
        named = {}
        lines = page["lines"]
        text = " ".join(r["text"] for r in lines[:18])
        if "Rupees in Lakhs" not in text:
            continue
        if not all(s in text for s in ["2024-25", "2025-26", "2026-27"]):
            continue
        dm = re.search(r"\b([IVXLCDM]+)\s+DEMAND\b", text)
        if dm and dm[1] != demand:
            demand = dm[1]
            major = minor = group = submajor = None
            named = {}
        for row_index, row in enumerate(lines):
            line = row["text"]
            mj = re.search(r"M\.J\.H\.\s*(\d{4})", line)
            if mj:
                if mj[1] != major:
                    minor = group = None
                    named = {}
                major = mj[1]
                sm = re.search(r"S\.M\.J\.H\.?\s*(\d{2})", line)
                submajor = sm[1] if sm else None
            body_major = re.search(r"(?:^|\s{2,})([24567]\d{3})\s+[A-Z]", line)
            if body_major and body_major[1] != major:
                major = body_major[1]
                minor = group = submajor = None
                named = {}
            mh = re.search(r"M\.H\.\s*(\d{3})", line)
            if mh and mh[1] != minor:
                minor = mh[1]
                group = None
                named = {}
            gh = re.search(r"G\.H\.\s*(\d{2})\s+(.+)", line)
            if gh and "Total G.H." not in line:
                group = gh[1]
                named = {}
            sh = re.search(r"S\.H\.\s*\((\d{2})\)\s+(.+)", line)
            if sh and "Total S.H." not in line:
                # Preserve only the explicit same-line English label. Wrapped
                # labels are marked partial rather than borrowing adjacent text.
                title = [sh[2].strip()]
                for following in lines[row_index + 1 : row_index + 6]:
                    fragment = following["text"][sh.start() :].strip()
                    if not fragment or re.match(
                        r"(?:[0-9]{3}\b|Total\b|[SMG]\.H\.|H\.O\.D\.)", fragment
                    ):
                        break
                    fragment = re.split(r"\s{2,}", fragment)[0]
                    if not re.fullmatch(r"[A-Za-z0-9 ()/&.,\[\]%-]+", fragment):
                        break
                    title.append(fragment)
                named[sh[1]] = (" ".join(title), page["page"], row["line"])
            total = re.search(r"Total S\.H\.\s*\((\d{2})\)\s*(.*)", line)
            if not total or not major or not minor or not demand:
                continue
            values = re.findall(r"-?\d[\d,]*\.\d{2}|\.{2,3}", total[2])
            if len(values) != 4:
                continue
            known = named.get(total[1])
            label = known[0] if known else "Source subhead (" + total[1] + ")"
            path = {
                "demand": demand,
                "major": major,
                "submajor": submajor,
                "minor": minor,
                "group": group,
                "subhead": total[1],
            }
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                value = values[column] if re.fullmatch(NUMBER, values[column]) else "--"
                classification = (
                    "maintenance_context"
                    if re.search(r"maintenance|repairs?", label, re.I)
                    else "salary_pension_context"
                    if re.search(r"\bsalaries\b|arrear pay", label, re.I)
                    else "administrative_context"
                    if re.search(r"secretariat|administration", label, re.I)
                    else "mixed_or_unresolved"
                )
                result.append(
                    record(
                        doc,
                        page["page"],
                        row["line"],
                        label,
                        value,
                        fy,
                        edition,
                        "lakh",
                        "ap_department_programme_subhead",
                        sourceAccountingPath=path,
                        labelScope="Printed English title and aligned continuation lines on the same page; descriptions crossing a page remain incomplete"
                        if known
                        else "Printed subhead code only; programme name unavailable",
                        sourceLabelLocator={"page": known[1], "line": known[2]} if known else None,
                        accountingPathComplete=all(
                            path[k] is not None
                            for k in ["demand", "major", "minor", "group", "subhead"]
                        ),
                        sourceEdition="FY2026–27 departmental demand book",
                        classification=classification,
                        overlapGroup="ap:"
                        + fy
                        + ":"
                        + ":".join(
                            str(path[k])
                            for k in ["demand", "major", "submajor", "minor", "group", "subhead"]
                        ),
                        notes="Printed programme subhead provision; salaries, transfers, loans and maintenance may be included. Department, sector and subhead totals overlap. Original/revised editions are alternatives. Dots stay unknown, not zero. Printed accounting path is not an asset/project identifier or proof of payment.",
                    )
                )
    return result


def assam_current_heads(doc, extraction):
    if doc["sourceId"] != "assam-afs-observed-54-2026":
        return []
    import pdfplumber
    from state_development_collection import ROOT
    from decimal import Decimal

    first = " ".join(r["text"] for r in extraction["pages"][0]["lines"][:12])
    if not all(
        t in first for t in ["STATEMENT OF EXPENDITURE", "2026-27", "2024-25", "Rupees in Lakhs"]
    ):
        raise ValueError("Assam current AFS fiscal/unit heading changed")
    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            if abs(page.width - 1122.72) > 1:
                raise ValueError("Assam fourteen-column page geometry changed")
            words = page.extract_words()
            # Source column 11 is the named head; 6/9/14 are the printed totals.
            heads = [
                w
                for w in words
                if 707 < w["x0"] < 740 and re.fullmatch(r"[234567]\d{3}", w["text"])
            ]
            for head in heads:
                center = (head["top"] + head["bottom"]) / 2
                line = [w for w in words if abs((w["top"] + w["bottom"]) / 2 - center) < 2]
                label = " ".join(
                    w["text"]
                    for w in sorted(line, key=lambda w: w["x0"])
                    if head["x1"] <= w["x0"] and w["x1"] <= 844 and re.search("[A-Za-z]", w["text"])
                )
                grant = [
                    w["text"]
                    for w in line
                    if 676 < w["x0"] < 707 and re.fullmatch(r"\d+", w["text"])
                ]
                for fy, edition, col in [
                    ("2025-2026", "original", 5),
                    ("2025-2026", "revised", 8),
                    ("2026-2027", "original", 13),
                ]:
                    bounds = [
                        (78, 142),
                        (142, 213.5),
                        (213.5, 277.5),
                        (277.5, 341.5),
                        (341.5, 412.7),
                        (412.7, 476.7),
                        (476.7, 540.7),
                        (540.7, 611.9),
                        (611.9, 675.9),
                        (675.9, 707.1),
                        (707.1, 844),
                        (844, 908),
                        (908, 979.2),
                        (979.2, 1043.3),
                    ]

                    def cell(i):
                        a, b = bounds[i]
                        v = [
                            w["text"]
                            for w in line
                            if a < (w["x0"] + w["x1"]) / 2 < b
                            and re.fullmatch(r"-?\d+\.\d{2}", w["text"])
                        ]
                        return v[0] if len(v) == 1 else None

                    total = cell(col)
                    general = cell(col - 2)
                    sixth = cell(col - 1)
                    difference = (
                        str(Decimal(total) - Decimal(general) - Decimal(sixth))
                        if None not in [total, general, sixth]
                        else None
                    )
                    result.append(
                        record(
                            doc,
                            n,
                            f"{head['text']}:{head['top']:.3f}",
                            label or "Source major head " + head["text"],
                            total or "--",
                            fy,
                            edition,
                            "lakh",
                            "assam_current_grant_major_head",
                            sourceMajorHead=head["text"],
                            sourceGrant=grant[0] if len(grant) == 1 else None,
                            sourceGeneralComponent=general,
                            sourceSixthScheduleComponent=sixth,
                            componentDifferenceSourceUnit=difference,
                            labelScope="Same-line English name only; wrapped labels remain partial and blank grants stay unknown",
                            sourceEdition="FY2026–27 Statement B, original production-host financial statement",
                            classification="debt_servicing_context"
                            if head["text"] in ["2048", "2049", "6003", "6004"]
                            else "mixed_or_unresolved",
                            notes="Grant/major-head provision, not individual expenditure or payments. General/Sixth Schedule amounts are components of the printed total. Does not confirm or replace the separate test-host expenditure export. Unknown cells remain unknown. Review editions, overlaps and source rights.",
                        )
                    )
    if not result:
        raise ValueError("Assam current AFS heads unavailable")
    return result


def hp_current_heads(doc, extraction):
    if doc["sourceId"] not in [
        "hp-form-revenue-2026",
        "hp-form-capital-2026",
        "hp-form-loans-2026",
    ]:
        return []
    first = " ".join(r["text"] for r in extraction["pages"][0]["lines"][:16])
    if not all(
        t in first
        for t in ["Annual Financial Statement", "Rs. In Lacs", "2024-25", "2025-26", "2026-27"]
    ):
        raise ValueError("Himachal fiscal/unit statement header changed")
    result = []
    for page in extraction["pages"]:
        rows = page["lines"]
        for i, row in enumerate(rows):
            m = re.fullmatch(
                r"\s*([234567]\d{3})\s+(.+?)\s{2,}(-?\d+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?\d+\.\d{2})\s+(-?\d+\.\d{2})\s*",
                row["text"],
            )
            if not m:
                continue
            labels = []
            for following in rows[i + 1 : i + 4]:
                english = re.fullmatch(r"\s*([A-Z][A-Z0-9, /()&.+:\-]+)\s*", following["text"])
                if not english:
                    break
                labels.append(english[1].strip())
            label = " ".join(labels) or "Source major head " + m[1]
            values = list(m.groups()[2:])
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                result.append(
                    record(
                        doc,
                        page["page"],
                        row["line"],
                        label,
                        values[column],
                        fy,
                        edition,
                        "lakh",
                        "hp_current_named_major_head",
                        sourceMajorHead=m[1],
                        sourceAccount=doc["sourceId"]
                        .removeprefix("hp-form-")
                        .removesuffix("-2026"),
                        labelScope="Printed following English line in bilingual head row; missing name retains head only",
                        sourceEdition="FY2026–27 public form financial statement",
                        classification="debt_servicing_context"
                        if m[1] in ["2048", "2049", "6003", "6004"]
                        else "mixed_or_unresolved",
                        notes="Annual head-level provision. Not actual project expenditure or a payment. Head/department/demand summaries overlap; maintenance and administrative exclusions require review. Separate recovery statements are not included in these gross expenditure rows.",
                    )
                )
    if not result:
        raise ValueError("Himachal named heads unavailable")
    return result


def cg_afs_heads(doc, extraction):
    current = doc["sourceId"] in ["cg-budget-2026-linked-10", "cg-budget-2026-linked-12"]
    old = doc["sourceId"] in ["cg-budget-2025-linked-11", "cg-budget-2025-linked-13"]
    if not current and not old:
        return []
    import pdfplumber
    from state_development_collection import ROOT

    first = " ".join(r["text"] for r in extraction["pages"][0]["lines"][:9])
    years = (
        ["2024-2025", "2025-2026", "2026-2027"]
        if current
        else ["2023-2024", "2024-2025", "2025-2026"]
    )
    if not all(t in first for t in years):
        raise ValueError("Chhattisgarh AFS fiscal columns changed")
    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            width = page.width
            heads = [
                w
                for w in words
                if 0.065 < w["x0"] / width < 0.14 and re.fullmatch(r"[234567]\d{3}", w["text"])
            ]
            for h in heads:
                center = (h["top"] + h["bottom"]) / 2
                line = [w for w in words if abs((w["top"] + w["bottom"]) / 2 - center) < 2]
                values = sorted(
                    [
                        w
                        for w in line
                        if w["x0"] / width > 0.45 and re.fullmatch(r"-?\d[\d,]*", w["text"])
                    ],
                    key=lambda w: w["x0"],
                )
                if len(values) != 4:
                    continue
                sourceLabel = " ".join(
                    w["text"]
                    for w in sorted(line, key=lambda w: w["x0"])
                    if h["x1"] <= w["x0"] and w["x1"] / width < 0.46
                )
                editions = (
                    [
                        ("2025-2026", "original", 1),
                        ("2025-2026", "revised", 2),
                        ("2026-2027", "original", 3),
                    ]
                    if current
                    else [("2025-2026", "original", 3)]
                )
                for fy, edition, column in editions:
                    result.append(
                        record(
                            doc,
                            n,
                            f"{h['text']}:{h['top']:.3f}",
                            "Source budget head " + h["text"],
                            values[column]["text"],
                            fy,
                            edition,
                            "thousand",
                            "cg_afs_major_head",
                            sourceMajorHead=h["text"],
                            sourceRawLabel=sourceLabel,
                            labelScope="Legacy-font Hindi name requires Unicode/visual review; no English purpose invented",
                            sourceEdition="FY2026–27 AFS" if current else "FY2025–26 AFS",
                            sourceAccount="capital"
                            if "capital_expenditure" in doc["url"]
                            else "revenue",
                            overlapGroup="cg:" + fy + ":" + edition + ":" + h["text"],
                            classification="debt_servicing_context"
                            if h["text"] in ["2048", "2049", "6003", "6004"]
                            else "mixed_or_unresolved",
                            notes="Printed AFS major-head amount, source unit thousand visually checked. Arabic monetary cells come from native PDF text, not Hindi OCR. Legacy-font descriptions and earlier/later editions need review. Not a payment or development-only total.",
                        )
                    )
    if not result:
        raise ValueError("Chhattisgarh AFS physical monetary rows unavailable")
    return result


def maharashtra_targeted_programmes(doc, extraction):
    if doc["sourceId"] != "mh-gender-child-observed-2026-linked-1":
        return []
    import pdfplumber
    from state_development_collection import ROOT

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            words = page.extract_words()
            head = " ".join(w["text"] for w in words if w["top"] < 195)
            if not re.search(r"Part\s+A1\s*-\s*100%", head):
                continue
            if not all(
                t.lower() in head.lower() for t in ["Thousands", "2024-25", "2025-26", "2026-27"]
            ):
                continue
            markers = {
                int(w["text"][1:-1]): w
                for w in words
                if re.fullmatch(r"\([1-9]\)", w["text"]) and w["top"] < 220
            }
            if set(markers) != set(range(1, 10)):
                continue
            centers = {i: (w["x0"] + w["x1"]) / 2 for i, w in markers.items()}
            if not all(centers[i] < centers[i + 1] for i in range(1, 9)):
                raise ValueError("Maharashtra nine-column targeted scheme geometry changed")
            serials = [
                w
                for w in words
                if w["top"] > markers[1]["bottom"]
                and 0.065 < w["x0"] / page.width < 0.09
                and re.fullmatch(r"\d{1,3}", w["text"])
            ]
            target = "children" if "Child Budget Statement" in head else "women_and_girls"
            for serial in serials:
                y = (serial["top"] + serial["bottom"]) / 2
                line = [w for w in words if abs((w["top"] + w["bottom"]) / 2 - y) < 2]
                label = " ".join(
                    w["text"]
                    for w in sorted(line, key=lambda w: w["x0"])
                    if serial["x1"] < w["x0"]
                    and w["x1"] < (centers[1] + centers[2]) / 2
                    and re.search("[A-Za-z]", w["text"])
                )
                for fy, edition, col in [("2025-2026", "revised", 6), ("2026-2027", "original", 8)]:
                    left = (centers[col - 1] + centers[col]) / 2
                    right = (centers[col] + centers[col + 1]) / 2
                    cells = [
                        w["text"]
                        for w in line
                        if left < (w["x0"] + w["x1"]) / 2 < right
                        and re.fullmatch(NUMBER, w["text"])
                    ]
                    value = cells[0] if len(cells) == 1 else "--"
                    result.append(
                        record(
                            doc,
                            n,
                            f"{serial['text']}:{serial['top']:.3f}",
                            label or "Source targeted scheme row " + serial["text"],
                            value,
                            fy,
                            edition,
                            "thousand",
                            "mh_targeted_programme_outlay",
                            sourceSerial=serial["text"],
                            sourceTargetGroup=target,
                            sourceSection="Part A1: 100% targeted schemes",
                            labelScope="Same-line English title fragment; full scheme description and code require original-row review",
                            sourceEdition="FY2026–27 gender and child budget statement",
                            notes="100% targeted programme subset, not every department’s whole budget. Beneficiary counts are not money; only printed monetary columns 6 and 8 are read. Earlier/later years and gender/child/department views overlap. Missing cells stay unknown. No project location, release or payment inferred.",
                        )
                    )
    if not result:
        raise ValueError("Maharashtra explicit 100%-targeted nine-column schemes unavailable")
    return result


def manipur_current_heads(doc, extraction):
    if doc["sourceId"] != "manipur-afs-observed-2026":
        return []
    import pdfplumber
    from state_development_collection import ROOT

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in [9, 10, 11, 13, 14]:
            page = pdf.pages[n - 1]
            text = (page.extract_text() or "").lower()
            if not all(t in text for t in ["lakhs", "2024-25", "2025-26", "2026-27"]):
                raise ValueError("Manipur financial columns changed")
            words = page.extract_words()
            years = sorted(
                [
                    w
                    for w in words
                    if w["top"] < 115 and w["text"] in ["2024-25", "2025-26", "2026-27"]
                ],
                key=lambda w: w["x0"],
            )
            if [w["text"] for w in years] != ["2024-25", "2025-26", "2025-26", "2026-27"]:
                raise ValueError("Manipur physical fiscal-column order changed")
            centers = [(w["x0"] + w["x1"]) / 2 for w in years]
            bounds = [
                (centers[0] - 35, (centers[0] + centers[1]) / 2),
                ((centers[0] + centers[1]) / 2, (centers[1] + centers[2]) / 2),
                ((centers[1] + centers[2]) / 2, (centers[2] + centers[3]) / 2),
                ((centers[2] + centers[3]) / 2, centers[3] + 35),
            ]
            heads = [
                w
                for w in words
                if w["top"] > 115 and w["x0"] < 110 and re.fullmatch(r"[234567]\d{3}-?", w["text"])
            ]
            for h in heads:
                y = (h["top"] + h["bottom"]) / 2
                line = [w for w in words if abs((w["top"] + w["bottom"]) / 2 - y) < 2]
                label = " ".join(
                    w["text"]
                    for w in sorted(line, key=lambda w: w["x0"])
                    if h["x1"] <= w["x0"] and w["x1"] < bounds[0][0]
                ).lstrip("- ")
                for fy, edition, col in [
                    ("2025-2026", "original", 1),
                    ("2025-2026", "revised", 2),
                    ("2026-2027", "original", 3),
                ]:
                    a, b = bounds[col]
                    cells = [
                        w["text"]
                        for w in line
                        if a < (w["x0"] + w["x1"]) / 2 < b and re.fullmatch(NUMBER, w["text"])
                    ]
                    value = cells[0] if len(cells) == 1 else "--"
                    head = h["text"].rstrip("-")
                    result.append(
                        record(
                            doc,
                            n,
                            f"{head}:{h['top']:.3f}",
                            label or "Source major head " + head,
                            value,
                            fy,
                            edition,
                            "lakh",
                            "manipur_current_major_head",
                            sourceMajorHead=head,
                            sourceAccount="revenue" if n <= 11 else "capital_debt_or_loans",
                            labelScope="Same-line English label; wrapped text remains partial",
                            amountBasis="as_printed_head_amount_recoveries_require_review",
                            classification="debt_servicing_context"
                            if head in ["2048", "2049", "6003", "6004"]
                            else "mixed_or_unresolved",
                            notes="AFS head provision, not project expenditure or payment. Blank cells remain unknown. This head-level statement does not supply the missing salary/other component split in the separate overview; those gaps remain open.",
                        )
                    )
    if not result:
        raise ValueError("Manipur current head table unavailable")
    return result


def haryana_programmes(doc, extraction):
    if doc["sourceId"] not in ["haryana-budget-2026-linked-2", "haryana-budget-2026-linked-3"]:
        return []
    result = []
    for page in extraction["pages"]:
        lines = page["lines"]
        header = " ".join(r["text"] for r in lines[:20])
        if "Expenditure(In ₹)" not in header or not all(
            t in header for t in ["2024-25", "2025-26", "2026-27"]
        ):
            continue
        major = re.search(r"Major-Head\s*:\s*(\d{4})", header)
        if not major:
            continue
        for row in lines:
            m = re.search(
                r"Total\s*:\s*\[(\d{2})\]\s+(.+?)\s{2,}(-?\d[\d,]*|\.{2,3})\s+(-?\d[\d,]*|\.{2,3})\s+(-?\d[\d,]*|\.{2,3})\s+(-?\d[\d,]*|\.{2,3})\s*$",
                row["text"],
            )
            if not m:
                continue
            label = m[2].strip()
            values = list(m.groups()[2:])
            for fy, edition, col in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                value = values[col] if re.fullmatch(NUMBER, values[col]) else "--"
                result.append(
                    record(
                        doc,
                        page["page"],
                        row["line"],
                        label,
                        value,
                        fy,
                        edition,
                        "rupee",
                        "haryana_programme_subhead_total",
                        sourceMajorHead=major[1],
                        sourceSubhead=m[1],
                        sourceAccount="capital"
                        if doc["sourceId"].endswith("linked-3")
                        else "revenue",
                        labelScope="Printed total-row English title fragment; wrapped title and full accounting path need original review",
                        sourceEdition="FY2026–27 expenditure demand book",
                        classification="maintenance_context"
                        if re.search(r"maintenance|repairs?", label, re.I)
                        else "administrative_context"
                        if re.search(r"administrati|establishment", label, re.I)
                        else "mixed_or_unresolved",
                        notes="Explicit scheme/subhead total in absolute rupees, not lakh/crore. Actuals column FY2024–25 excluded. Original/revised estimates are alternatives. Full department/head and scheme totals overlap. No project, release or payment inferred.",
                    )
                )
    return result


def karnataka_regional_programmes(doc, extraction):
    if doc["sourceId"] != "ka-budget-volumes-observed-2026-linked-4":
        return []
    import pdfplumber
    from state_development_collection import ROOT

    result = []
    with pdfplumber.open(ROOT / doc["original"]) as pdf:
        for n in [29, 30, 31]:
            page = pdf.pages[n - 1]
            words = page.extract_words()
            text = " ".join(w["text"] for w in words)
            if not all(
                t in text for t in ["Regional Imbalance Redressal Program", "2026-27", "Crores"]
            ):
                raise ValueError("Karnataka regional programme scope/year/unit changed")
            heads = sorted(
                [w for w in words if re.fullmatch(r"\d{4}-\d{2}-\d{3}-\d-\d{2}", w["text"])],
                key=lambda w: w["top"],
            )
            for i, h in enumerate(heads):
                y = (h["top"] + h["bottom"]) / 2
                cells = [
                    w["text"]
                    for w in words
                    if w["x0"] / page.width > 0.84
                    and abs((w["top"] + w["bottom"]) / 2 - y) < 2
                    and re.fullmatch(NUMBER, w["text"])
                ]
                if len(cells) != 1:
                    continue
                bottom = heads[i + 1]["top"] - 1 if i + 1 < len(heads) else page.height - 50
                title = []
                for w in sorted(words, key=lambda w: (round(w["top"] / 3), w["x0"])):
                    if (
                        h["top"] - 2 <= w["top"] < bottom
                        and 0.42 < w["x0"] / page.width < 0.82
                        and w["x1"] / page.width < 0.84
                    ):
                        token = re.sub(r"\(cid:\d+\)", "", w["text"])
                        if re.fullmatch(r"[A-Za-z0-9/&,().%-]+", token) and re.search(
                            "[A-Za-z]", token
                        ):
                            title.append(token)
                result.append(
                    record(
                        doc,
                        n,
                        h["text"],
                        " ".join(title) or "Regional programme budget head " + h["text"],
                        cells[0],
                        "2026-2027",
                        "original",
                        "crore",
                        "karnataka_regional_imbalance_programme",
                        sourceProgrammeBudgetHead=h["text"],
                        sourceEdition="FY2026–27 overview/memorandum regional programme table",
                        labelScope="English words within the same printed programme block; native-language glyphs retained in original",
                        classification="maintenance_context"
                        if re.search(r"maintenance|repair", " ".join(title), re.I)
                        else "mixed_or_unresolved",
                        notes="Regional Imbalance Redressal Programme allocation only, not whole programme/department funding. Overlaps AFS and detailed demand books. Printed Union/state-share descriptions are not transfers or payments. Last wrapped title continuation on another page needs review.",
                    )
                )
    if not result:
        raise ValueError("Karnataka regional programme rows unavailable")
    return result


def tamil_inspected_revenue_heads(doc, extraction):
    """Nine printed major heads visually checked on immutable AFS physical page 13."""
    if doc["sourceId"] != "tn-treasury-afs-observed-2025":
        return []
    if (
        doc["stateCode"] != "33"
        or doc["sha256"] != "d7945e16a4f47f3e706a483ea66a33287da8866328466c487bfbd9f831ea08fa"
    ):
        raise ValueError("Inspected Tamil Nadu edition changed")
    rows = [
        ("2215", "Water supply and sanitation", "722,74,11"),
        ("2216", "Housing", "3,665,58,06"),
        ("2217", "Urban development", "1,968,00,21"),
        ("2220", "Information and publicity", "227,45,94"),
        (
            "2225",
            "Welfare of Scheduled Castes, Scheduled Tribes, Other Backward Classes and Minorities",
            "4,741,90,40",
        ),
        ("2230", "Labour, employment and skill development", "3,223,31,10"),
        ("2235", "Social security and welfare", "29,467,70,89"),
        ("2236", "Nutrition", "6,732,44,83"),
        ("2245", "Relief on account of natural calamities", "1,715,56,90"),
    ]
    return [
        record(
            doc,
            13,
            head,
            label,
            value,
            "2025-2026",
            "original",
            "thousand",
            "tn_inspected_revenue_major_head",
            sourceMajorHead=head,
            sourceEdition="Annual Financial Statement Budget 2025–2026; original cover, not index heading",
            extractionBasis="Manual transcription checked against original physical PDF page 13 / printed page 12; rightmost Budget Estimate 2025–2026 column",
            classification="mixed_or_unresolved",
            notes="Selected revenue major heads only; full statewide original preserved and all 42 pages OCR-processed but unverified. Includes operating expenditure, transfers and potentially maintenance. Overlaps department/programme totals. FY2023–24 actuals and FY2024–25 original/revised columns excluded. Not individual payments or a development-only total.",
        )
        for head, label, value in rows
    ]


def goa_current_heads(doc, extraction):
    if doc["sourceId"] not in [
        "goa-budget-alternative-linked-15",
        "goa-budget-alternative-linked-17",
    ]:
        return []
    result = []
    header = " ".join(r["text"] for r in extraction["pages"][0]["lines"][:8])
    if not all(
        t in header for t in ["DISBURSEMENT", "Rs. in lakhs", "2024-2025", "2025-2026", "2026-2027"]
    ):
        raise ValueError("Goa disbursement head fiscal columns or units changed")
    for page in extraction["pages"]:
        # The standalone three-page source table prints its header on page 1.
        # Continuations are restricted to this exact observed disbursement file.
        lines = page["lines"]
        for row in lines:
            m = re.match(
                r"^\s*([2-7]\d{3})\s+(.+?)\s{2,}(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$",
                row["text"],
            )
            if not m:
                continue
            values = m.groups()[2:]
            for fy, edition, col in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                result.append(
                    record(
                        doc,
                        page["page"],
                        row["line"],
                        m[2],
                        values[col],
                        fy,
                        edition,
                        "lakh",
                        "goa_current_disbursement_major_head",
                        sourceMajorHead=m[1],
                        sourceAccount="revenue"
                        if doc["sourceId"].endswith("linked-15")
                        else "capital_debt_or_loans",
                        labelScope="Printed same-line title; wrapped continuations require original review",
                        classification="debt_servicing_context"
                        if m[1] in ["2048", "2049", "6003", "6004"]
                        else "salary_pension_context"
                        if m[1] == "2071"
                        else "mixed_or_unresolved",
                        notes="FY2026–27 AFS disbursement head. FY2025–26 original and revised are alternatives. Includes administration, operating costs and debt/loans; not a development-only headline. FY2024–25 actuals are outside requested scope and excluded. Not current-year expenditure or project payments.",
                    )
                )
    if not result:
        raise ValueError("Goa disbursement major heads unavailable")
    return result


def goa_demand_major_heads(doc, extraction):
    """Goa department demand major-head estimates, checked to page controls."""
    if doc["sourceId"] != "goa-demands-volume-i-full-alt-host-2026":
        return []
    if (
        doc["stateCode"] != "30"
        or doc["sha256"] != "24a914d142ede879ebd3ee92d84c17f03cb905a29214a8e7390feed73fffdcdd"
    ):
        raise ValueError("Goa full demand volume source edition changed")
    from decimal import Decimal
    from state_development_budget_tables import record

    number = r"-?\d[\d,]*\.\d{2}"
    head_pattern = re.compile(
        rf"^\s*(\d{{4}})\s+(.+?)\s+({number})\s+({number})\s+({number})\s+({number})\s*$"
    )
    total_pattern = re.compile(
        rf"^\s*Total\s+Demand\s+No\s+([A-Z0-9]+)\s+({number})\s+({number})\s+({number})\s+({number})\s*$"
    )
    found = []
    demand_codes = []
    for page in extraction["pages"]:
        if not any(r["text"].strip() for r in page["lines"]):
            continue
        header = " ".join(r["text"] for r in page["lines"][:10])
        if not all(t in header for t in ["Rs. in lakhs", "2024-2025", "2025-2026", "2026-2027"]):
            raise ValueError(f"Goa demand page {page['page']} fiscal/unit heading changed")
        total = None
        heads = []
        for row in page["lines"]:
            m = total_pattern.match(row["text"])
            if m:
                total = (
                    m[1],
                    [Decimal(m.group(i).replace(",", "")) for i in range(2, 6)],
                    row["line"],
                )
                continue
            m = head_pattern.match(row["text"])
            if m:
                heads.append(
                    (
                        row["line"],
                        m[1],
                        m[2].strip(),
                        [Decimal(m.group(i).replace(",", "")) for i in range(3, 7)],
                    )
                )
        if not total:
            if heads:
                raise ValueError(
                    f"Goa demand major heads have no printed total on page {page['page']}"
                )
            continue
        if not heads:
            if any(total[1][column] for column in (1, 2, 3)):
                raise ValueError(f"Goa nonzero demand {total[0]} has no extracted major heads")
            demand_codes.append(total[0])
            continue
        if len({h[1] for h in heads}) != len(heads):
            raise ValueError(f"Duplicate Goa major head on page {page['page']}")
        differences = [
            sum((h[3][col] for h in heads), Decimal(0)) - total[1][col] for col in (1, 2, 3)
        ]
        if any(differences):
            raise ValueError(
                f"Goa demand {total[0]} fails FY2025-26 BE/RE or FY2026-27 BE control on page {page['page']}"
            )
        demand_codes.append(total[0])
        for line, code, label, values in heads:
            for fy, edition, column in [
                ("2025-2026", "original", 1),
                ("2025-2026", "revised", 2),
                ("2026-2027", "original", 3),
            ]:
                classification = (
                    "debt_servicing_context"
                    if code in {"2048", "2049", "6003", "6004"}
                    else "salary_pension_context"
                    if code == "2071"
                    else "mixed_or_unresolved"
                )
                found.append(
                    record(
                        doc,
                        page["page"],
                        line,
                        label,
                        format(values[column], "f"),
                        fy,
                        edition,
                        "lakh",
                        "goa_demand_major_head",
                        sourceDemandNumber=total[0],
                        sourceMajorHead=code,
                        sourceBudgetEdition="FY2026–27 Goa Demands Volume I; includes FY2025–26 BE/RE comparator",
                        sourcePageDemandTotalLine=total[2],
                        sourcePageMajorHeadControl="matched printed demand total for FY2025–26 original, FY2025–26 revised and FY2026–27 original",
                        labelScope="same-line printed major-head title; wrapped title continuations are not inferred",
                        overlapGroup=f"goa:demand:{total[0]}:head:{code}:{fy}",
                        classification=classification,
                        notes="Budget provision by state demand and major account head, not a project, release, actual expenditure or payment. Parent demand total is retained only as a printed reconciliation control and not duplicated as a candidate. Major-head descriptions can cover maintenance, administration, salary, transfers and mixed uses; purpose remains unclassified until the underlying detailed source establishes it. FY2025–26 BE and revised BE are alternatives, not additive. FY2024–25 actual column is excluded from this current/previous-year collection.",
                    )
                )
    if len(set(demand_codes)) != len(demand_codes) or len(demand_codes) != 103:
        raise ValueError(
            f"Goa demand section census changed: {len(set(demand_codes))} unique / {len(demand_codes)} pages"
        )
    if len(found) != 1077:
        raise ValueError(f"Goa demand major-head row census changed: {len(found)}")
    return found


def jharkhand_crossreferenced_june_actuals(doc, extraction):
    """June cumulative expenditure, using amount units printed on referenced trend pages."""
    if doc["sourceId"] != "cag-monthly-20-linked-2":
        return []
    if (
        doc["stateCode"] != "20"
        or doc["sha256"] != "cfb37fda2a7b1b29890adb677d5b2804143e9dc9df1e6641a8294edebb64daeb"
    ):
        raise ValueError("Jharkhand CAG source edition changed")
    from state_development_amounts import rupees, reference

    rows = []
    items = [
        (
            10,
            "4(a)",
            "Expenditure on revenue account, excluding interest, salary, pension and subsidy",
            "mixed_or_unresolved",
        ),
        (11, "4(b)", "Interest payments", "debt_servicing_context"),
        (12, "4(c)", "Salaries and wages", "salary_pension_context"),
        (13, "4(d)", "Pension expenditure", "salary_pension_context"),
        (14, "4(e)", "Subsidy expenditure", "mixed_or_unresolved"),
        (
            15,
            "5(a)",
            "Capital account expenditure, excluding capital salaries",
            "mixed_or_unresolved",
        ),
        (16, "5(b)", "Capital account salaries and wages", "salary_pension_context"),
        (17, "8", "Loans and advances disbursed", "broad_financial_context"),
    ]
    for page_no, item, label, classification in items:
        page = next((p for p in extraction["pages"] if p["page"] == page_no), None)
        if not page:
            raise ValueError(f"Jharkhand source page {page_no} unavailable")
        text = " ".join(r["text"] for r in page["lines"])
        if (
            f"Refer to Item No. {item}" not in text
            or "in Crores" not in text
            or "Monthly Trend" not in text
        ):
            raise ValueError(f"Jharkhand item {item} unit/cross-reference changed")
        june = next((r["text"] for r in page["lines"] if re.match(r"^\s*June\s+", r["text"])), None)
        values = re.findall(r"-?\d[\d,]*\.\d{2}", june or "")
        if len(values) != 4:
            raise ValueError(f"Jharkhand item {item} June row changed")
        for offset, (fy, col) in enumerate([("2026-2027", 1), ("2025-2026", 3)]):
            period = f"{2026 - offset}-06-30"
            start = f"{2026 - offset}-04-01"
            token = values[col]
            rows.append(
                {
                    "id": f"{doc['sha256']}:p{page_no}:item{item}:{fy}:june-progressive",
                    "stateCode": "20",
                    "financialYear": fy,
                    "purposeLabel": label,
                    "measure": "reported_spent",
                    "estimate": None,
                    "unit": "crore",
                    "sourceAmount": token,
                    "amountRupees": rupees(token, "crore"),
                    "periodStart": start,
                    "periodEnd": period,
                    "sourceReportCutoff": period,
                    "accountingBasis": "provisional_cumulative_booked_accounting_expenditure",
                    "sourceItemReference": item,
                    "classification": classification,
                    "reviewStatus": "awaiting_review",
                    "publicationApproved": False,
                    "source": reference(
                        doc,
                        f"Original PDF page {page_no}; Monthly Trend; explicitly refers to June Accounts-at-a-Glance item {item}; June progressive column for FY {fy}; unit printed as crores",
                    ),
                    "notes": "Unaudited provisional cumulative accounts through June, not audited final expenditure, a project allocation, contractor bill or settlement. For item 4, this component excludes the separately listed items 4(b)–4(e); for item 5(a), item 5(b) is separate. Never add a parent/total row to its component. Original report separately labels FY2026–27 and FY2025–26 progressive columns. Exact unit is taken from the cross-referenced trend page.",
                }
            )
    return rows


def goa_demand_budget_summaries(doc, extraction):
    """All-Demand annual totals, reconciled to Goa's printed top-level control."""
    if doc["sourceId"] != "goa-budget-alternative-linked-10":
        return []
    if (
        doc["stateCode"] != "30"
        or doc["sha256"] != "372133495751984cd0213737652672afa4bb29d9c298107c676d09f599db5007"
    ):
        raise ValueError("Goa demand summary source edition changed")
    from decimal import Decimal
    from state_development_amounts import rupees, reference

    cp = json.loads(
        (__import__("state_development_collection").BASE / "30" / "checkpoint.json").read_text()
    )
    summary = next(
        (d for d in cp["documents"] if d["sourceId"] == "goa-budget-alternative-linked-8"), None
    )
    if not summary:
        raise ValueError("Goa independent all-demands control source unavailable")
    summary_pages = json.loads(
        (
            __import__("state_development_collection").BASE / "30" / (summary["sha256"] + ".json")
        ).read_text()
    )["pages"]
    if summary_pages[0]["page"] != 1:
        raise ValueError("Goa control report page missing")
    control = None
    for row in summary_pages[0]["lines"]:
        if re.match(r"^\s*Total\s+", row["text"]):
            nums = re.findall(r"\d[\d,]*\.\d{2}", row["text"])
            if len(nums) == 3:
                control = tuple(Decimal(v.replace(",", "")) for v in nums)
    if control is None:
        raise ValueError("Goa printed all-demand control not found")
    if not all(
        t in " ".join(r["text"] for r in extraction["pages"][0]["lines"][:8])
        for t in ["Rs. in lakhs", "Revenue Exp", "Capital Exp", "2026-2027"]
    ):
        raise ValueError("Goa department summary edition/unit changed")
    pat = re.compile(
        r"^\s*([0-9]{2}|A[1-3])\s+(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$"
    )
    found = []
    for page in extraction["pages"]:
        for row in page["lines"]:
            m = pat.match(row["text"])
            if m:
                found.append((page["page"], row["line"], m[1], m[2].strip(), m[3], m[4], m[5]))
    codes = [r[2] for r in found]
    if len(found) != 97 or len(set(codes)) != 97:
        raise ValueError("Goa all-demand rows are incomplete or duplicated")
    sums = tuple(
        sum((Decimal(r[i].replace(",", "")) for r in found), Decimal(0)) for i in [4, 5, 6]
    )
    if sums != control:
        raise ValueError("Goa demand sums disagree with the independent printed control")
    result = []
    for page, line, code, label, revenue, capital, total in found:
        classification = (
            "debt_servicing_context"
            if code == "A2"
            else "administrative_context"
            if code
            in [
                "01",
                "A1",
                "10",
                "14",
                "19",
                "22",
                "27",
                "28",
                "29",
                "30",
                "32",
                "33",
                "56",
                "62",
                "73",
                "75",
                "79",
                "80",
                "88",
                "91",
                "93",
            ]
            else "mixed_or_unresolved"
        )
        result.append(
            {
                "id": f"{doc['sha256']}:p{page}:line{line}:demand{code}:2026-2027",
                "stateCode": "30",
                "financialYear": "2026-2027",
                "purposeLabel": label,
                "measure": "allocated",
                "estimate": "original",
                "unit": "lakh",
                "sourceAmount": total,
                "amountRupees": rupees(total, "lakh"),
                "sourceDemandCode": code,
                "sourceRevenueComponent": revenue,
                "sourceRevenueRupees": rupees(revenue, "lakh"),
                "sourceCapitalComponent": capital,
                "sourceCapitalRupees": rupees(capital, "lakh"),
                "aggregation": "state_demand_total",
                "budgetTableScope": "goa_demand_total",
                "sourceEdition": "FY2026–27 Volume II demand-wise revenue/capital/total estimate",
                "classification": classification,
                "reviewStatus": "awaiting_review",
                "publicationApproved": False,
                "overlapGroup": f"goa:2026-2027:demand:{code}",
                "source": reference(
                    doc,
                    f"Original PDF page {page}, demand row {code}, Revenue Exp/Capital Exp/Total columns; independently checked to FY2026–27 All-Demands Vol-I control PDF page 1",
                ),
                "sourceControl": {
                    "reference": reference(
                        summary,
                        "Original PDF page 1, printed Total Revenue/Capital/Total line; sums of all 97 demand rows agree exactly",
                    ),
                    "rowCount": 97,
                    "revenueLakhs": format(sums[0], ".2f"),
                    "capitalLakhs": format(sums[1], ".2f"),
                    "totalLakhs": format(sums[2], ".2f"),
                },
                "notes": "Department/demand aggregate covering general, operating, transfer and possibly maintenance expenditure. Not development-only; not a project, release, actual expenditure or contractor payment. Revenue and capital components are retained within this one total and must not be added again; overlaps the Goa AFS major-head view. Charged debt/service demands are included as printed and remain separately identifiable.",
            }
        )
    return result


def sikkim_sic_budget_heads(doc, extraction):
    """One Sikkim department table; parent and object-head rows reconcile to controls."""
    if doc["sourceId"] != "sikkim-sic-budget-2026-observed":
        return []
    if (
        doc["stateCode"] != "11"
        or doc["sha256"] != "caf4221c3fe914634e3dab7d35e4df630edff023a228b97c5a1222dc5077f905"
    ):
        raise ValueError("Sikkim Information Commission source edition changed")
    from decimal import Decimal
    from state_development_amounts import rupees, reference

    pages = extraction["pages"]
    header = " ".join(r["text"] for r in pages[0]["lines"][:20])
    if not all(
        x in header
        for x in [
            "Demand No. 28",
            "In Thousands of Rupees",
            "Actuals",
            "Budget Estimates 2025-26",
            "Revised",
            "Budget Estimate",
            "2026-27",
        ]
    ):
        raise ValueError("Sikkim SIC fiscal headers or units changed")
    tables = extraction["tables"]
    if (
        len(tables) != 1
        or not tables[0]["rows"]
        or tables[0]["rows"][0][0] != "Major/Sub-Major/Minor/Sub/Detailed Heads"
    ):
        raise ValueError("Sikkim SIC source table changed")
    group = None
    total = None
    details = []
    for index, row in enumerate(tables[0]["rows"][1:], start=2):
        if row and row[0].startswith("Total"):
            if total is not None:
                raise ValueError("Duplicate Sikkim SIC printed total")
            # HTML parser omits the first blank rowspan cell in this row.
            values = row[2:6]
            if len(values) != 4:
                raise ValueError("Sikkim SIC total row column layout changed")
            total = (index, values)
        elif row and re.match(r"^45\s+ChiefInformationCommission$", row[0]):
            if group is not None or len(row) != 5:
                raise ValueError("Sikkim SIC parent row changed")
            group = (index, row[0], row[1:5])
        else:
            normalized = row[1:] if len(row) == 7 and not row[0].strip() else row
            if len(normalized) != 6 or not re.fullmatch(r"45\.00\.\d{2}", normalized[0]):
                raise ValueError(f"Sikkim SIC object-head row {index} changed")
            details.append((index, normalized[0], normalized[1], normalized[2:6]))
    if group is None or total is None or len(details) != 18 or len({r[1] for r in details}) != 18:
        raise ValueError("Sikkim SIC department/head census is incomplete")
    # Actuals 2024-25 are outside scope; the three requested estimate columns
    # must reconcile as parent plus its detail-head children, never duplicated.
    for column in [1, 2, 3]:
        child = sum(
            (Decimal(row[3][column].replace(",", "")) for row in details if row[3][column].strip()),
            Decimal(0),
        )
        parent = Decimal(group[2][column].replace(",", ""))
        printed = Decimal(total[1][column].replace(",", ""))
        if parent + child != printed:
            raise ValueError("Sikkim SIC budget components do not match printed total")
    result = []
    lines = [(group[0], group[1], group[1], group[2])] + [
        (row[0], row[1], row[2], row[3]) for row in details
    ]
    for line, code, label, values in lines:
        for fy, edition, col in [
            ("2025-2026", "original", 1),
            ("2025-2026", "revised", 2),
            ("2026-2027", "original", 3),
        ]:
            token = values[col].strip()
            if not token:
                continue
            result.append(
                {
                    "id": f"{doc['sha256']}:table1:r{line}:{fy}:{edition}",
                    "stateCode": "11",
                    "financialYear": fy,
                    "purposeLabel": label,
                    "measure": "allocated",
                    "estimate": edition,
                    "unit": "thousand",
                    "sourceAmount": token,
                    "amountRupees": rupees(token, "thousand"),
                    "aggregation": "sikkim_sic_demand28_head_component",
                    "budgetTableScope": "department_demand_detail",
                    "origin": "state_budget_including_transfers",
                    "sourceDemandCode": "28",
                    "sourceHeadCode": code if code != "45 ChiefInformationCommission" else "45",
                    "hierarchyRole": "parent"
                    if code == "45 ChiefInformationCommission"
                    else "object_head_detail",
                    "parentSourceCode": "45",
                    "overlapGroup": "sikkim:2026-2027:demand28:head45",
                    "classification": "administrative_context",
                    "reviewStatus": "awaiting_review",
                    "publicationApproved": False,
                    "source": reference(
                        doc,
                        f"Official department HTML table 1, row {line}, source head {code}, {fy} {edition} estimate column; explicit thousand-rupee unit",
                    ),
                    "sourceControl": {
                        "printedTotalRow": total[0],
                        "reconciledBudgetEstimateComponents": True,
                    },
                    "notes": "Single-department Information Commission appropriation detail, not statewide coverage or development spending. Parent and object-head values form components matching the printed total and must not be duplicated with another summary. Empty cells remain unknown. Original source labels and unit are preserved; no project, release, payment recipient or location is provided.",
                }
            )
    return result
