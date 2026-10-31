#!/usr/bin/env python3
"""Preserve GNCTD's official FY2026-27 detailed grant volumes for private review."""

import hashlib, json, re, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = "https://finance.delhi.gov.in/finance/detailed-demands-grants-2026-27"
HOST = "finance.delhi.gov.in"
MAX_FILE = 32 * 1024 * 1024
MAX_TOTAL = 128 * 1024 * 1024


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            item = dict(attrs)
            if item.get("href") and re.fullmatch(r"D-\d+", item.get("title", "")):
                self.items.append((item["title"], item["href"]))


def same_host_opener():
    from urllib.parse import urlparse

    class Guard(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            parsed = urlparse(newurl)
            if parsed.scheme != "https" or parsed.hostname != HOST:
                raise ValueError("Redirect left the official Delhi Finance host")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    return urllib.request.build_opener(Guard())


def fetch(opener, url, limit):
    from urllib.parse import urlparse

    p = urlparse(url)
    if p.scheme != "https" or p.hostname != HOST:
        raise ValueError("Only official Delhi Finance HTTPS links are accepted")
    req = urllib.request.Request(
        url, headers={"User-Agent": "Hisaab source assessment; private preservation"}
    )
    with opener.open(req, timeout=30) as res:
        body = res.read(limit + 1)
    if len(body) > limit:
        raise ValueError("Document exceeded configured size bound")
    return body


def run():
    opener = same_host_opener()
    page = fetch(opener, INDEX, 5 * 1024 * 1024).decode("utf-8", "replace")
    parser = Links()
    parser.feed(page)
    volumes = sorted(set(parser.items), key=lambda x: int(x[0][2:]))
    if len(volumes) != 20 or [int(t[2:]) for t, _ in volumes] != list(range(1, 21)):
        raise ValueError(f"Expected D-1 through D-20, found {[x[0] for x in volumes]}")
    folder = ROOT / "data/originals/state-budgets/delhi-2026-27"
    folder.mkdir(parents=True, exist_ok=True)
    manifest = {
        "source": "GNCTD Finance Department detailed demands for grants",
        "indexUrl": INDEX,
        "retrievedAt": datetime.now(timezone.utc).isoformat(),
        "permission": "Official source accessed; republication permission not reviewed; private evidence review only.",
        "publicationApproved": False,
        "volumes": [],
    }
    total = 0
    for title, href in volumes:
        url = "https://" + HOST + href if href.startswith("/") else href
        body = fetch(opener, url, MAX_FILE)
        total += len(body)
        if total > MAX_TOTAL:
            raise ValueError("Aggregate download size exceeded configured bound")
        if not body.startswith(b"%PDF-"):
            raise ValueError(f"{title} did not return a PDF")
        digest = hashlib.sha256(body).hexdigest()
        name = f"{title.lower().replace('-', '-')}.pdf"
        path = folder / name
        if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            name = f"{title.lower()}-{digest[:8]}.pdf"
            path = folder / name
        path.write_bytes(body)
        manifest["volumes"].append(
            {
                "volume": title,
                "url": url,
                "file": str(path.relative_to(ROOT)),
                "sha256": digest,
                "bytes": len(body),
                "status": "original_preserved_private",
            }
        )
    manifest["totalBytes"] = total
    manifestPath = ROOT / "data/acquisition/national-coverage/delhi-budget-2026-27-manifest.json"
    manifestPath.parent.mkdir(parents=True, exist_ok=True)
    manifestPath.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    return manifest


if __name__ == "__main__":
    result = run()
    print(
        json.dumps(
            {
                "volumes": len(result["volumes"]),
                "totalBytes": result["totalBytes"],
                "published": False,
            }
        )
    )
