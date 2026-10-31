"""Observed district scheme financial reports; expenditure is not a payment."""

import argparse, json, re, hashlib
from html.parser import HTMLParser
from decimal import Decimal
from urllib.parse import urlparse
from ppms_project_dossiers import ROOT, Links, source


class Rows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.active = False
        self.row = None
        self.cell = None
        self.rows = []

    def handle_starttag(self, tag, attrs):
        if tag == "table" and dict(attrs).get("id") == "shorttable5":
            self.active = True
        if self.active and tag == "tr":
            self.row = []
        if self.active and tag == "td":
            self.cell = []

    def handle_data(self, text):
        if self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if tag == "tr" and self.row:
            if self.row[0].isdigit() and len(self.row) != 10:
                raise ValueError("Changed scheme report columns")
            if len(self.row) == 10 and self.row[0].isdigit():
                self.rows.append(self.row)
            self.row = None
        if tag == "table":
            self.active = False


def normalize(html):
    if "Rs. in Lakh" not in html:
        raise ValueError("Explicit lakh unit missing")
    p = Rows()
    p.feed(html)
    records = []
    for row in p.rows:
        ids = re.findall(r"(?:TSM|SM)/\d+", row[2])
        if not ids:
            raise ValueError("Official scheme identity missing")
        amounts = {
            k: str(Decimal(v.replace(",", "")))
            for k, v in zip(["sanctionLakh", "allotmentLakh", "reportedExpenditureLakh"], row[5:8])
        }
        if any(not Decimal(v).is_finite() or Decimal(v) < 0 for v in amounts.values()):
            raise ValueError("Invalid financial amount")
        records.append(
            dict(
                district=row[1],
                title=row[2],
                officialSchemeIds=ids,
                category=row[3],
                sourceSanctionDate=row[4],
                **amounts,
                reportedPhysicalPercent=row[9],
                individualPayments=[],
                geographyVerified=False,
                approved=False,
            )
        )
    if not records:
        raise ValueError("No schema-validated scheme rows; not zero coverage")
    return records


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--max-pages", type=int, default=5)
    a = p.parse_args()
    if not 1 <= a.max_pages <= 5:
        raise ValueError("Use up to five district pages per batch")
    base = ROOT / "data/acquisition/wb-jjm"
    index = json.loads((base / "index.source.json").read_text())
    raw = (base / (index["sha256"] + ".html")).read_bytes()
    if hashlib.sha256(raw).hexdigest() != index["sha256"]:
        raise ValueError("Index checksum mismatch")
    links = Links()
    links.feed(raw.decode())
    urls = list(
        dict.fromkeys(
            u
            for u in links.urls
            if urlparse(u).netloc == "maps.wbphed.gov.in"
            and re.fullmatch(
                r"/house_hold-2020/report/jjm-schemes-financial-status-distirct/\d+",
                urlparse(u).path,
            )
        )
    )
    path = base / "assessment.json"
    d = json.loads(path.read_text()) if path.exists() else dict(partitions=[], failures=[])
    done = {x["source"]["url"] for x in d["partitions"]} | {x["url"] for x in d["failures"]}
    n = 0
    for u in urls:
        if u in done:
            continue
        if n >= a.max_pages:
            break
        n += 1
        try:
            html, meta = source(u, base)
            records = normalize(html)
            d["partitions"].append(dict(source=meta, records=records))
        except Exception as e:
            d["failures"].append(dict(url=u, error=str(e)))
    d.update(
        approved=False,
        scope="Observed West Bengal district scheme reports; cumulative expenditure, not dated transactions",
    )
    path.write_text(json.dumps(d, indent=2) + "\n")
    summary = dict(
        districtPartitions=len(d["partitions"]),
        observedPartitions=len(urls),
        schemeRows=sum(len(x["records"]) for x in d["partitions"]),
        failures=len(d["failures"]),
        individualPayments=0,
        approvedPayments=0,
        completeObservedPartitions=len(d["partitions"]) == len(urls) and not d["failures"],
    )
    (ROOT / "data/wb-jjm-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
