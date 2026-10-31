"""Join observed PPMS project rows to treasury bills by exact official project code.

Bounded pagination follows actual official links. Acquisitions stay private;
treasury-success status is not promoted to a settled contractor payment.
"""

import argparse, hashlib, json, time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import urlopen, Request
from ppms_ifms import parse

ROOT = Path(__file__).resolve().parents[1]
SEED = "https://ppms.odisha.gov.in/report/common-project-details-new?block=Balangir&district=Balangir&geo_status=true&page=2&panchayat=&state=Odisha&type=after_img_count&village="


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []

    def handle_starttag(self, tag, attrs):
        if tag == "a" and dict(attrs).get("href"):
            self.urls.append(dict(attrs)["href"])


def source(url, base):
    checkpoint = base / (hashlib.sha256(url.encode()).hexdigest() + ".source.json")
    if checkpoint.exists():
        metadata = json.loads(checkpoint.read_text())
        raw = (base / (metadata["sha256"] + ".html")).read_bytes()
        if hashlib.sha256(raw).hexdigest() != metadata["sha256"]:
            raise ValueError("Source checksum mismatch")
        return raw.decode(), metadata
    with urlopen(
        Request(url, headers={"User-Agent": "Hisaab official-record assessment"}), timeout=25
    ) as response:
        raw = response.read(10_000_001)
    if len(raw) > 10_000_000:
        raise ValueError("Source exceeds bounded size")
    checksum = hashlib.sha256(raw).hexdigest()
    (base / (checksum + ".html")).write_bytes(raw)
    metadata = dict(
        url=url,
        sha256=checksum,
        retrievedAt=datetime.now(timezone.utc).isoformat(),
        accessBasis="Official public report link",
        publicationBasis="Unreviewed; private assessment only",
    )
    checkpoint.write_text(json.dumps(metadata, indent=2) + "\n")
    time.sleep(0.3)
    return raw.decode(), metadata


def join(projects, bills):
    index = {}
    for p in projects:
        code = p.get("Project Code")
        if not code:
            raise ValueError("Missing official project code")
        index.setdefault(code, []).append(p)
    dossiers = []
    for code in sorted({b["Project Code"] for b in bills}):
        matched = [b for b in bills if b["Project Code"] == code]
        versions = index.get(code, [])
        facts = [
            {k: v for k, v in p.items() if k not in ["Sl. No.", "sourceLinks"]} for p in versions
        ]
        conflict = bool(facts and any(p != facts[0] for p in facts[1:]))
        dossiers.append(
            dict(
                projectCode=code,
                project=versions[0] if versions and not conflict else None,
                projectEditions=versions,
                projectConflict=conflict,
                bills=matched,
                matchBasis="Exact project code · conflicting editions"
                if conflict
                else ("Exact PPMS project code" if code in index else "Project detail missing"),
                paymentDatesVerified=False,
                amountBasis="unknown",
                approved=False,
            )
        )
    return dossiers


def main():
    args = argparse.ArgumentParser()
    args.add_argument("--max-pages", type=int, default=10)
    options = args.parse_args()
    if not 1 <= options.max_pages <= 10:
        raise ValueError("Use up to ten observed pilot pages")
    base = ROOT / "data/acquisition/ppms/projects"
    base.mkdir(parents=True, exist_ok=True)
    html, metadata = source(SEED, base)
    links = Links()
    links.feed(html)
    observed = [SEED]
    for url in links.urls:
        p = urlparse(url)
        q = parse_qs(p.query)
        if (
            p.netloc == "ppms.odisha.gov.in"
            and p.path == "/report/common-project-details-new"
            and q.get("block") == ["Balangir"]
            and q.get("district") == ["Balangir"]
            and q.get("page")
            and q["page"] != ["2"]
            and url not in observed
        ):
            observed.append(url)
    projects = []
    sources = []
    failures = []
    for url in observed[: options.max_pages]:
        try:
            page, source_metadata = source(url, base)
            rows = parse(page, "exortTable")
            projects.extend(rows)
            sources.append(source_metadata)
        except Exception as error:
            failures.append(dict(url=url, error=str(error)))
    bills = json.loads((ROOT / "data/acquisition/ppms/balangir-ifms-assessment.json").read_text())[
        "records"
    ]
    dossiers = join(projects, bills)
    result = dict(
        dossiers=dossiers,
        sources=sources,
        failures=failures,
        scope="Observed geo-status project-report partitions only; not the entire project catalogue",
        approved=False,
    )
    (base / "balangir-dossiers.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            dict(
                projectRows=len(projects),
                dossiers=len(dossiers),
                withProjectDetails=sum(d["project"] is not None for d in dossiers),
                pages=len(sources),
                failures=failures,
            )
        )
    )


if __name__ == "__main__":
    main()
