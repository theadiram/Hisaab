#!/usr/bin/env python3
"""Index searchable text in the privately preserved Delhi grant PDFs.

This does not classify spending, normalize amounts, or create public facts.
Use the bundled Python runtime with pdfplumber installed.
"""

import json
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data/acquisition/national-coverage/delhi-budget-2026-27-manifest.json"


def run():
    manifest = json.loads(MANIFEST.read_text())
    output = ROOT / "data/acquisition/national-coverage/delhi-2026-27"
    output.mkdir(parents=True, exist_ok=True)
    total_pages = 0
    searchable = 0
    scans = []
    for item in manifest["volumes"]:
        pages = []
        with pdfplumber.open(ROOT / item["file"]) as pdf:
            for number, page in enumerate(pdf.pages, 1):
                text = page.extract_text() or ""
                pages.append(text)
                total_pages += 1
                searchable += bool(text.strip())
        characters = sum(map(len, pages))
        textfile = output / f"{item['volume'].lower().replace('-', '-')}.txt"
        if characters:
            textfile.write_text(
                "\n\n".join(f"--- Page {n} ---\n{t}" for n, t in enumerate(pages, 1)),
                encoding="utf-8",
            )
        scan_pages = [i + 1 for i, t in enumerate(pages) if not t.strip()]
        item.update(
            {
                "pageCount": len(pages),
                "searchablePages": len(pages) - len(scan_pages),
                "extractedCharacters": characters,
                "textIndex": str(textfile.relative_to(ROOT)) if characters else None,
                "classification": "not_reviewed",
                "publication": "private_only",
            }
        )
        if scan_pages:
            scans.append({"volume": item["volume"], "pages": scan_pages})
    manifest.update(
        {
            "indexMethod": "pdfplumber embedded-text extraction; no OCR or amount classification",
            "totalPages": total_pages,
            "searchablePages": searchable,
            "scanPages": scans,
            "classification": "not reviewed; figures remain source evidence, not normalized facts",
        }
    )
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return {
        "volumes": len(manifest["volumes"]),
        "pages": total_pages,
        "searchablePages": searchable,
        "scanPages": scans,
    }


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False))
