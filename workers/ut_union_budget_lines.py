#!/usr/bin/env python3
"""Preserve detailed MHA/UT demand lines for all eight Union Territories.

The output is an owner-review source index. It does not classify development,
normalize values, calculate totals, or infer recipient-side expenditure.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEMANDS = {
    52: "Andaman and Nicobar Islands",
    53: "Chandigarh",
    54: "Dadra and Nagar Haveli and Daman and Diu",
    55: "Ladakh",
    56: "Lakshadweep",
    57: "Delhi",
    58: "Jammu and Kashmir",
    59: "Puducherry",
}


def extract(inventories):
    records = []
    for year, inventory in inventories:
        seen = set()
        for row in inventory["rows"]:
            number = row.get("demandNumber")
            if number not in DEMANDS:
                continue
            identity = (number, row.get("page"), row.get("line"), row.get("rawText"))
            if identity in seen:
                raise ValueError(
                    f"Duplicate source identity within demand {number} / {year}: {identity}"
                )
            seen.add(identity)
            records.append(
                {
                    "jurisdiction": DEMANDS[number],
                    "demandNumber": number,
                    "financialYear": year,
                    "sourceId": row.get("id"),
                    "page": row.get("page"),
                    "line": row.get("line"),
                    "rawText": row.get("rawText"),
                    "sourceHash": row.get("sourceHash"),
                    "sourceUrl": row.get("sourceUrl"),
                    "sourceClassification": row.get("classification", "awaiting_review"),
                    "sourceAggregation": row.get("aggregation", "unresolved"),
                    "sourceUnit": row.get("unit", "source_header_review_required"),
                    "sourceFinancialColumns": row.get(
                        "financialColumns", "source_header_review_required"
                    ),
                    "reviewStatus": "private_unreviewed_source_line",
                    "isDevelopmentAmount": None,
                    "isPaymentEvidence": False,
                }
            )
    if {x["demandNumber"] for x in records} != set(DEMANDS):
        raise ValueError("One or more UT demand numbers are missing")
    return records


def run():
    base = ROOT / "data/acquisition/funding-inventory"
    inventories = [
        ("2025-2026", json.loads((base / "2025-2026.json").read_text())),
        ("2026-2027", json.loads((base / "2026-2027.json").read_text())),
    ]
    records = extract(inventories)
    result = {
        "source": "Union Budget Notes on Demands for Grants, MHA Demands 52–59",
        "sourceUrl": "https://www.indiabudget.gov.in/doc/eb/allsbe.pdf",
        "editions": ["2025-2026", "2026-2027"],
        "jurisdictions": list(DEMANDS.values()),
        "rowCount": len(records),
        "classification": "private source-line index only; development classification and fiscal columns remain unreviewed",
        "additionRules": "Do not sum parent totals with children, gross with net/recovery rows, or BE with RE. Raw text is preserved exactly with printed page/line locators.",
        "records": records,
    }
    target = ROOT / "data/acquisition/national-coverage/union-ut-demand-lines.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    return result


if __name__ == "__main__":
    result = run()
    by_year = {
        year: sum(1 for row in result["records"] if row["financialYear"] == year)
        for year in result["editions"]
    }
    print(
        json.dumps(
            {
                "jurisdictions": len(result["jurisdictions"]),
                "rows": result["rowCount"],
                "byYear": by_year,
                "reviewed": False,
            }
        )
    )
