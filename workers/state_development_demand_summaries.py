"""Checkpointed inspection of Tripura's observed original demand summaries.

Reads private original bytes, verifies their checksum and never publishes money.
Default batch is 100 pages; rerun until complete before normalizing the supplement.
"""

import argparse
import hashlib
import json
import re
from pypdf import PdfReader
from state_development_collection import BASE, ROOT, write, now


def collect(batch_pages=100):
    if not 1 <= batch_pages <= 100:
        raise ValueError("Batch must contain 1–100 pages")
    checkpoint = json.loads((BASE / "16/checkpoint.json").read_text())
    doc = next(d for d in checkpoint["documents"] if d["sourceId"] == "tripura-budget-2025")
    original = ROOT / doc["original"]
    if hashlib.sha256(original.read_bytes()).hexdigest() != doc["sha256"]:
        raise ValueError("Original checksum changed")
    reader = PdfReader(original)
    path = BASE / "16/demand-summary-pages.json"
    previous = json.loads(path.read_text()) if path.exists() else {}
    if previous and previous.get("sourceSha256") != doc["sha256"]:
        write(
            path.parent / ("demand-summary-editions/" + previous["sourceSha256"] + ".json"),
            previous,
        )
        previous = {}
    processed = previous.get("processedPages", 0)
    pages = {p["page"]: p for p in previous.get("pages", [])}
    end = min(len(reader.pages), processed + batch_pages)
    for index in range(processed, end):
        page = reader.pages[index]
        text = page.extract_text(extraction_mode="layout") if "/Contents" in page else ""
        if (
            re.search(r"DEMAND NO\s*:-", text)
            and "Major Heads which will be accounted for under this Demand" in text
        ):
            pages[index + 1] = {
                "page": index + 1,
                "lines": [
                    {"line": n, "text": t} for n, t in enumerate(text.splitlines(), 1) if t.strip()
                ],
            }
    result = {
        "sourceSha256": doc["sha256"],
        "totalPages": len(reader.pages),
        "processedPages": end,
        "completeInspection": end == len(reader.pages),
        "pages": [pages[n] for n in sorted(pages)],
        "checkedAt": now(),
        "scope": "Demand summary page discovery; not every programme extraction or complete financial coverage",
    }
    write(path, result)
    print(
        json.dumps({k: result[k] for k in ["processedPages", "totalPages", "completeInspection"]})
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-pages", type=int, default=100)
    collect(parser.parse_args().batch_pages)
