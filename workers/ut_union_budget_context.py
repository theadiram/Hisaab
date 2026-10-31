#!/usr/bin/env python3
"""Extract reported Union Budget context totals for the eight UT demands.

These are not development-only amounts, state/UT utilization, contractor
payments, or independently reviewed public facts. Source rows and locators are
retained, and blanks remain unknown.
"""

import json, re
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMANDS = {
    52: ("Andaman and Nicobar Islands", "territory_demand"),
    53: ("Chandigarh", "territory_demand"),
    54: ("Dadra and Nagar Haveli and Daman and Diu", "territory_demand"),
    55: ("Ladakh", "territory_demand"),
    56: ("Lakshadweep", "territory_demand"),
    57: ("Delhi", "transfer_demand"),
    58: ("Jammu and Kashmir", "transfer_demand"),
    59: ("Puducherry", "transfer_demand"),
}
TOKEN = re.compile(r"\.\.\.|-?\d[\d,]*(?:\.\d+)?")


def parse_cells(line):
    cells = TOKEN.findall(line)
    if len(cells) != 12:
        raise ValueError(f"Expected twelve fiscal cells, got {len(cells)}: {line}")
    return cells


def extract(inventory, year):
    records = []
    for demand, (name, scope) in DEMANDS.items():
        matches = [
            r
            for r in inventory["rows"]
            if r.get("demandNumber") == demand
            and r["rawText"].strip().lower().startswith("grand total")
        ]
        if not matches:
            raise ValueError(f"Missing Grand Total source row for demand {demand} / {year}")
        parsed = [parse_cells(r["rawText"]) for r in matches]
        if any(row != parsed[0] for row in parsed[1:]):
            raise ValueError(f"Conflicting duplicate Grand Total rows for demand {demand} / {year}")
        cells = parsed[0]
        rev, cap, total = cells[-3:]
        for raw in (rev, cap, total):
            if raw != "..." and raw != "-":
                # Check decimal syntax and exact revenue + capital control below.
                if not re.fullmatch(r"-?\d[\d,]*(?:\.\d+)?", raw):
                    raise ValueError("Unsupported monetary cell")

        def number(raw):
            return None if raw in ("...", "-") else raw.replace(",", "")

        if rev not in ("...", "-") and cap not in ("...", "-") and total not in ("...", "-"):
            if Decimal(number(rev)) + Decimal(number(cap)) != Decimal(number(total)):
                raise ValueError(
                    f"Revenue + capital does not match reported total for {name} / {year}"
                )
        locator = matches[0]
        records.append(
            {
                "jurisdiction": name,
                "demandNumber": demand,
                "scopeType": scope,
                "financialYear": year,
                "measure": "Union Budget estimate, source-reported net total",
                "unit": "crore_rupees",
                "revenue": number(rev),
                "capital": number(cap),
                "reportedTotal": number(total),
                "sourceHash": locator["sourceHash"],
                "sourceUrl": locator["sourceUrl"],
                "locator": f"Demand {demand}, page {locator['page']}, line {locator['line']}; {locator['rawText']}",
                "classification": "unclassified_for_development",
                "status": "private_candidate_pending_review",
                "warning": (
                    "Not a development-only amount, full local UT budget, recipient utilization, project allotment, or payment. "
                    "Delhi, Jammu and Kashmir, and Puducherry entries are transfer demands; remaining entries are territory demands. "
                    "Do not combine these totals with ministry programme/state budget figures without a documented reconciliation."
                ),
            }
        )
    return records


def run():
    base = ROOT / "data/acquisition/funding-inventory"
    rows = extract(json.loads((base / "2025-2026.json").read_text()), "2025-2026")
    rows += extract(json.loads((base / "2026-2027.json").read_text()), "2026-2027")
    result = {
        "source": "Union Budget Notes on Demands for Grants; Ministry of Home Affairs, UT Demands 52–59",
        "sourceUrl": "https://www.indiabudget.gov.in/doc/eb/allsbe.pdf",
        "sourceHash": "4f10ec12b2daf5ec0cd1c83642aa7682deb274ad863d0d16e72368ad5f743b25",
        "publicationApproved": False,
        "rightsReviewed": False,
        "scope": "FY2025–26 and FY2026–27 budget-context totals only; no actual expenditure or payment evidence.",
        "records": rows,
    }
    out = ROOT / "data/acquisition/national-coverage/union-ut-budget-context.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


if __name__ == "__main__":
    result = run()
    print(
        json.dumps(
            {"jurisdictions": len(DEMANDS), "records": len(result["records"]), "published": False}
        )
    )
