"""Bounded local table inspection for Rajasthan and Gujarat acquired outcome budgets.

Preserves table cells, source checksum and page numbers. It does not publish or
interpret programme allocations; the source-specific adapter does that privately.
"""

import argparse
import hashlib
import json
import pdfplumber
from state_development_collection import BASE, ROOT, write, now


def collect(batch_pages=60, state="8"):
    if not 1 <= batch_pages <= 100:
        raise ValueError("Batch must contain 1–100 pages")
    if state not in ("8", "24"):
        raise ValueError("Only inspected outcome sources are supported")
    folder = BASE / state
    cp = json.loads((folder / "checkpoint.json").read_text())
    doc = next(
        d
        for d in cp["documents"]
        if d["sourceId"]
        == ("rajasthan-outcome-2026" if state == "8" else "gujarat-budget-observed-4")
    )
    original = ROOT / doc["original"]
    if hashlib.sha256(original.read_bytes()).hexdigest() != doc["sha256"]:
        raise ValueError("Original checksum changed")
    target = folder / "outcome-tables.json"
    old = json.loads(target.read_text()) if target.exists() else {}
    if old and old.get("sourceSha256") != doc["sha256"]:
        write(folder / ("outcome-table-editions/" + old["sourceSha256"] + ".json"), old)
        old = {}
    start = old.get("processedPages", 0)
    pages = {p["page"]: p for p in old.get("pages", [])}
    with pdfplumber.open(original) as pdf:
        total = len(pdf.pages)
        end = min(total, start + batch_pages)
        for i in range(start, end):
            p = pdf.pages[i]
            pages[i + 1] = {
                "page": i + 1,
                "tables": p.extract_tables(),
                "heading": (p.extract_text() or "")[:1800],
            }
    result = {
        "sourceSha256": doc["sha256"],
        "processedPages": end,
        "totalPages": total,
        "completeInspection": end == total,
        "pages": [pages[n] for n in sorted(pages)],
        "checkedAt": now(),
        "scope": "Local table inspection; incomplete/misaligned tables still require original-page review",
    }
    write(target, result)
    print(
        json.dumps({k: result[k] for k in ["processedPages", "totalPages", "completeInspection"]}),
        flush=True,
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--batch-pages", type=int, default=60)
    p.add_argument("--state", default="8")
    args = p.parse_args()
    collect(args.batch_pages, args.state)
