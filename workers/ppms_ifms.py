"""Assess preserved official PPMS tables without inferring settled payments."""

import argparse
import hashlib
import json
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TableParser(HTMLParser):
    def __init__(self, table_id="exportTable"):
        super().__init__()
        self.table_id = table_id
        self.active = False
        self.rows = []
        self.row = None
        self.cell = None
        self.row_links = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "table" and dict(attrs).get("id") == self.table_id:
            self.active = True
        if self.active and tag == "tr":
            self.row = []
            self.row_links = []
        if self.active and tag in ["td", "th"]:
            self.cell = []
        if self.active and tag == "a" and dict(attrs).get("href"):
            self.row_links.append(dict(attrs)["href"])

    def handle_data(self, text):
        if self.active and self.cell is not None:
            self.cell.append(text)

    def handle_endtag(self, tag):
        if self.active and tag in ["td", "th"] and self.cell is not None:
            self.row.append(" ".join("".join(self.cell).split()))
            self.cell = None
        if self.active and tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.links.append(self.row_links)
            self.row = None
        if self.active and tag == "table":
            self.active = False


def parse(html, table_id="exportTable"):
    parser = TableParser(table_id)
    parser.feed(html)
    if not parser.rows:
        raise ValueError("Official export table missing")
    headings = parser.rows[0]
    records = []
    for index, row in enumerate(parser.rows[1:], 1):
        if len(row) == 2 and row[0] == "TOTAL":
            continue
        if len(row) != len(headings):
            raise ValueError("Unexpected column count")
        record = dict(zip(headings, row))
        record["sourceLinks"] = parser.links[index]
        records.append(record)
    return records


def main():
    arg = argparse.ArgumentParser()
    arg.add_argument("files", type=Path, nargs="+")
    args = arg.parse_args()
    if len(args.files) > 4:
        raise ValueError("At most four observed report pages per assessment")
    base = ROOT / "data/acquisition/ppms"
    base.mkdir(parents=True, exist_ok=True)
    records = []
    sources = []
    url = "https://ppms.odisha.gov.in/report/ifms-transaction?block=Balangir&district=Balangir&state=Odisha"
    for page, file in enumerate(args.files, 1):
        raw = file.read_bytes()
        checksum = hashlib.sha256(raw).hexdigest()
        (base / (checksum + ".html")).write_bytes(raw)
        sources.append(
            dict(
                url=url + (f"&page={page}" if page > 1 else ""),
                sha256=checksum,
                retrievedOn="2026-10-07",
            )
        )
        for record in parse(raw.decode()):
            record["sourcePage"] = page
            record["sourceSha256"] = checksum
            records.append(record)
    keys = [(r["Project Code"], r["Bill Serial No"], r["Bill No"]) for r in records]
    if len(keys) != len(set(keys)):
        raise ValueError(
            "Duplicate project/bill identity across pages; reconcile editions before counting"
        )
    result = dict(
        sources=sources,
        records=records,
        scope="Four observed pagination pages for Balangir block; report-cutoff and status semantics still unverified",
        publicationBasis="Privacy policy is not a reuse grant; publication basis unresolved, private inspection only",
        approved=False,
    )
    (base / "balangir-ifms-assessment.json").write_text(json.dumps(result, indent=2) + "\n")
    summary = dict(
        updatedOn="2026-10-07",
        source="Odisha PPMS IFMS transaction report",
        district="Balangir",
        block="Balangir",
        pagesCollected=len(args.files),
        billRecords=len(records),
        panchayats=len({r["Gram Panchayat / Ulb"] for r in records}),
        statusCounts=dict(Counter(r["Status"] for r in records)),
        verifiedPayments=0,
        publishedProjects=0,
        missing=[
            "Payment dates",
            "Recipient identities/roles",
            "Gross/net definitions",
            "Report cutoff",
            "Reviewed exact project geography",
            "Reuse basis",
        ],
        scope="One block; source-reported bill status, not independently confirmed settlement",
    )
    (ROOT / "data/ppms-acquisition.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(
        json.dumps(
            dict(
                recordCount=len(records),
                columns=list(records[0]) if records else [],
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
