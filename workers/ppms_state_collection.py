"""Checkpoint a bounded statewide batch following observed report links only."""

import argparse, json, hashlib
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlparse, parse_qs
from ppms_project_dossiers import source, Links, ROOT
from ppms_ifms import parse

SEED = "https://ppms.odisha.gov.in/report/ifms-transaction?state=Odisha"


def permitted(url):
    p = urlparse(url)
    q = parse_qs(p.query)
    return (
        p.netloc == "ppms.odisha.gov.in"
        and p.path == "/report/ifms-transaction"
        and q.get("state") == ["Odisha"]
        and set(q) <= {"state", "page"}
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-pages", type=int, default=10)
    parser.add_argument("--retry-failures", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 20:
        raise ValueError("Use 1–20 pages per batch")
    base = ROOT / "data/acquisition/ppms/state-assessment"
    base.mkdir(parents=True, exist_ok=True)
    checkpoint = base / "state-batch-assessment.json"
    previous = json.loads(checkpoint.read_text()) if checkpoint.exists() else {}
    queue = previous.get("pendingObservedUrls", [SEED])
    visited = [s["url"] for s in previous.get("sources", [])]
    rows = previous.get("records", [])
    sources = previous.get("sources", [])
    failures = previous.get("failures", [])
    batch_pages = 0
    if args.retry_failures and failures:
        original = checkpoint.read_bytes()
        (base / (hashlib.sha256(original).hexdigest() + ".checkpoint.json")).write_bytes(original)
        # Retry only previously observed failed URLs, preserving the earlier checkpoint.
        retry_urls = [f["url"] for f in failures if permitted(f["url"]) and f["url"] not in visited]
        queue = list(dict.fromkeys(retry_urls + queue))
        failures = [f for f in failures if f["url"] not in retry_urls]
    with ThreadPoolExecutor(max_workers=3) as pool:
        while queue and batch_pages < args.max_pages:
            batch = []
            while queue and len(batch) < 3 and batch_pages < args.max_pages:
                url = queue.pop(0)
                if url in visited:
                    continue
                if not permitted(url):
                    raise ValueError("Checkpoint contains an unpermitted report URL")
                visited.append(url)
                batch_pages += 1
                batch.append(url)
            futures = [pool.submit(source, url, base) for url in batch]
            for url, future in zip(batch, futures):
                try:
                    html, meta = future.result()
                    records = parse(html)
                    rows.extend(
                        dict(r, sourceUrl=url, sourceSha256=meta["sha256"]) for r in records
                    )
                    sources.append(meta)
                    links = Links()
                    links.feed(html)
                    for link in links.urls:
                        if permitted(link) and link not in visited and link not in queue:
                            queue.append(link)
                except Exception as error:
                    failures.append(dict(url=url, error=str(error)))
    index = {}
    conflicts = previous.get("conflicts", [])
    for r in rows:
        key = (r["Project Code"], r["Bill Serial No"], r["Bill No"])
        facts = {
            k: v
            for k, v in r.items()
            if k not in ["Sl. No.", "sourceLinks", "sourceUrl", "sourceSha256"]
        }
        if key in index and facts != {
            k: v
            for k, v in index[key].items()
            if k not in ["Sl. No.", "sourceLinks", "sourceUrl", "sourceSha256"]
        }:
            conflicts.append(dict(identity=key, editions=[index[key], r]))
        else:
            index.setdefault(key, r)
    result = dict(
        records=list(index.values()),
        conflicts=conflicts,
        sources=sources,
        pendingObservedUrls=queue,
        failures=failures,
        complete=not queue and not failures,
        approved=False,
        scope="Bounded observed statewide report pages; no claim of complete payment coverage",
    )
    (base / "state-batch-assessment.json").write_text(json.dumps(result, indent=2) + "\n")
    summary = dict(
        collectedPages=len(sources),
        billRecords=len(index),
        projectCodes=len({r["Project Code"] for r in index.values()}),
        districts=len({r["District"] for r in index.values()}),
        panchayats=None,
        conflicts=len(conflicts),
        failedPages=len(failures),
        complete=result["complete"],
        approvedPayments=0,
    )
    (ROOT / "data/ppms-state-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
