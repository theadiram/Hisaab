"""Checkpointed local English OCR of privately preserved public-source PDFs.

OCR results are unverified text; source-specific visual review is mandatory.
"""

import argparse
import hashlib
import json
import subprocess
import pdfplumber
from state_development_collection import BASE, ROOT, write, now


def collect(code, source, batch_pages=8):
    if not 1 <= batch_pages <= 12:
        raise ValueError("OCR batch must contain 1–12 pages")
    cp = json.loads((BASE / code / "checkpoint.json").read_text())
    doc = next(d for d in cp["documents"] if d["sourceId"] == source)
    original = ROOT / doc["original"]
    if hashlib.sha256(original.read_bytes()).hexdigest() != doc["sha256"]:
        raise ValueError("Original checksum changed")
    binary = BASE / "local-ocr"
    if not binary.exists():
        subprocess.run(
            ["swiftc", str(ROOT / "workers/state_development_ocr.swift"), "-o", str(binary)],
            check=True,
        )
        binary.chmod(0o700)
    folder = BASE / code / ("ocr-" + doc["sha256"])
    folder.mkdir(exist_ok=True)
    folder.chmod(0o700)
    checkpoint = folder / "checkpoint.json"
    old = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    start = old.get("processedPages", 0)
    with pdfplumber.open(original) as pdf:
        total = len(pdf.pages)
        end = min(total, start + batch_pages)
        for index in range(start, end):
            page = index + 1
            img = folder / f"p{page}.png"
            output = folder / f"p{page}.json"
            pdf.pages[index].to_image(resolution=170).save(img)
            img.chmod(0o600)
            subprocess.run([str(binary), str(img), str(output)], check=True)
            value = json.loads(output.read_text())
            value.update(
                {
                    "sourceSha256": doc["sha256"],
                    "page": page,
                    "rotationDegrees": 0,
                    "reviewStatus": "ocr_unverified",
                }
            )
            write(output, value)
            write(
                checkpoint,
                {
                    "sourceSha256": doc["sha256"],
                    "processedPages": page,
                    "totalPages": total,
                    "completeInspection": page == total,
                    "checkedAt": now(),
                    "reviewStatus": "ocr_unverified",
                },
            )
    print(
        json.dumps(
            {"processedPages": end, "totalPages": total, "completeInspection": end == total}
        ),
        flush=True,
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--state", required=True)
    p.add_argument("--source", required=True)
    p.add_argument("--batch-pages", type=int, default=8)
    a = p.parse_args()
    collect(a.state, a.source, a.batch_pages)
