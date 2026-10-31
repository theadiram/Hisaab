"""Bounded local continuation beyond saved 150-page extraction caps.

Supplemental text retains the unchanged official hash and original page numbers.
Complete text processing is not complete financial evidence or publication review.
"""

import argparse, json, hashlib
from pypdf import PdfReader
from state_development_collection import BASE, ROOT, write, now


def collect(code, max_pages=200):
    if not 1 <= max_pages <= 250:
        raise ValueError("Choose 1–250 local pages per batch")
    cp = json.loads((BASE / code / "checkpoint.json").read_text())
    processed = 0
    completed = []
    for doc in cp["documents"]:
        if not (
            (code == "28" and "/Volume-III-" in doc["url"])
            or (
                code == "6"
                and doc["sourceId"]
                in ["haryana-budget-2026-linked-2", "haryana-budget-2026-linked-3"]
            )
        ):
            continue
        original = ROOT / doc["original"]
        if hashlib.sha256(original.read_bytes()).hexdigest() != doc["sha256"]:
            raise ValueError("Original checksum changed")
        base = json.loads((ROOT / doc["extraction"]).read_text())
        target = BASE / code / "full-text" / f"{doc['sha256']}.json"
        old = (
            json.loads(target.read_text())
            if target.exists()
            else {
                "sourceSha256": doc["sha256"],
                "processedPages": len(base["pages"]),
                "pages": base["pages"],
            }
        )
        if old["sourceSha256"] != doc["sha256"]:
            raise ValueError("Supplement changed source edition")
        reader = PdfReader(original)
        total = len(reader.pages)
        start = old["processedPages"]
        if start >= total:
            continue
        end = min(total, start + max_pages - processed)
        for i in range(start, end):
            text = reader.pages[i].extract_text(extraction_mode="layout") or ""
            old["pages"].append(
                {
                    "page": i + 1,
                    "lines": [
                        {"line": j, "text": line}
                        for j, line in enumerate(text.splitlines(), 1)
                        if line.strip()
                    ],
                }
            )
        old.update(
            processedPages=end,
            totalPages=total,
            completeTextProcessing=end == total,
            checkedAt=now(),
            reviewStatus="text_unverified",
        )
        write(target, old)
        processed += end - start
        completed.append({"source": doc["sourceId"], "processedPages": end, "totalPages": total})
        if processed >= max_pages:
            break
    result = {"localPagesProcessed": processed, "sources": completed}
    print(json.dumps(result), flush=True)
    return result


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--state", choices=["28", "6"], required=True)
    p.add_argument("--max-pages", type=int, default=200)
    a = p.parse_args()
    collect(a.state, a.max_pages)
