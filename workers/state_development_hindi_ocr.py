"""Bounded local Hindi/English OCR, with immutable originals and page checksums."""

import argparse, json, hashlib, subprocess
import pdfplumber
from state_development_collection import ROOT, BASE, write, now


def collect(code, source, pages):
    if not 1 <= len(pages) <= 12 or any(n < 1 for n in pages):
        raise ValueError("Choose 1–12 positive original page numbers")
    cp = json.loads((BASE / code / "checkpoint.json").read_text())
    doc = next(d for d in cp["documents"] if d["sourceId"] == source)
    original = ROOT / doc["original"]
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    if digest != doc["sha256"]:
        raise ValueError("Original changed")
    folder = BASE / code / ("ocr-hindi-" + digest)
    folder.mkdir(exist_ok=True)
    folder.chmod(0o700)
    manifest = []
    with pdfplumber.open(original) as pdf:
        for n in sorted(set(pages)):
            if n > len(pdf.pages):
                raise ValueError("Original page does not exist")
            output = folder / f"p{n}.json"
            if output.exists():
                saved = json.loads(output.read_text())
                if saved.get("sourceSha256") != digest or saved.get("page") != n:
                    raise ValueError("OCR checkpoint identity changed")
                continue
            image = folder / f"p{n}.png"
            pdf.pages[n - 1].to_image(resolution=220).save(image)
            image.chmod(0o600)
            manifest.append({"image": str(image), "output": str(output), "hash": digest, "page": n})
    m = folder / "manifest.json"
    write(m, manifest)
    if manifest:
        subprocess.run(
            ["node", str(ROOT / "workers/state_development_hindi_ocr.mjs"), str(m)],
            check=True,
            timeout=300,
        )
    processed = sorted(int(p.stem[1:]) for p in folder.glob("p*.json"))
    write(
        folder / "checkpoint.json",
        {
            "sourceSha256": digest,
            "processedPages": processed,
            "checkedAt": now(),
            "reviewStatus": "ocr_unverified",
            "scope": "Selected original pages, not full-document or monetary approval",
        },
    )
    print(json.dumps({"source": source, "processedPages": processed, "approved": False}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--state", required=True)
    p.add_argument("--source", required=True)
    p.add_argument("--pages", required=True)
    a = p.parse_args()
    collect(a.state, a.source, [int(n) for n in a.pages.split(",")])
