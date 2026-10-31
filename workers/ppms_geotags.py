"""Extract official project-linked image metadata, retaining source approval labels.

Source-approved photos do not imply Hisaab verification or payment settlement.
Image URLs are recorded, not downloaded or republished.
"""

import json, re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from ppms_project_dossiers import ROOT, source


class Geotags(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stage = None
        self.heading = None
        self.heading_tag = None
        self.depth = 0
        self.item = None
        self.items = []
        self.codes = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ["h5", "h6"]:
            self.heading = []
            self.heading_tag = tag
        if tag == "div":
            if self.item is not None:
                self.depth += 1
            elif "item" in attrs.get("class", "").split():
                self.item = dict(stage=self.stage, text=[], imageUrls=[])
                self.depth = 1
        if self.item is not None and tag == "img":
            url = attrs.get("src", "")
            p = urlparse(url)
            if p.netloc == "ppms.odisha.gov.in" and p.path.startswith("/upload/statusimage/"):
                self.item["imageUrls"].append(url)

    def handle_data(self, text):
        if self.heading is not None:
            self.heading.append(text)
        if self.item is not None:
            self.item["text"].append(text)

    def handle_endtag(self, tag):
        if tag == self.heading_tag and self.heading is not None:
            text = " ".join("".join(self.heading).split())
            if tag == "h5" and text.lower() in ["before", "during", "after"]:
                self.stage = text.lower()
            if tag == "h6" and text.startswith("OD/"):
                self.codes.append(text)
            self.heading = None
            self.heading_tag = None
        if tag == "div" and self.item is not None:
            self.depth -= 1
            if self.depth == 0:
                self.items.append(self.item)
                self.item = None


def parse_geotags(html, expected_code):
    parser = Geotags()
    parser.feed(html)
    if parser.codes != [expected_code]:
        raise ValueError("Geotag page project identity does not match")
    records = []
    for item in parser.items:
        text = " ".join(" ".join(item["text"]).split())
        coordinates = re.search(
            r"Latitude\s*-\s*(-?\d+(?:\.\d+)?)\s*,\s*Longitude\s*-\s*(-?\d+(?:\.\d+)?)", text
        )
        date = re.search(r"Date\s*:\s*(\d{2}-\d{2}-\d{4})", text)
        status = re.search(r"Status\s*:\s*(Approved|Pending|Rejected)", text, re.I)
        if not coordinates:
            continue
        lat, lon = map(float, coordinates.groups())
        if not -90 <= lat <= 90 or not -180 <= lon <= 180 or (lat == 0 and lon == 0):
            raise ValueError("Invalid source coordinates")
        records.append(
            dict(
                stage=item["stage"],
                latitude=coordinates[1],
                longitude=coordinates[2],
                sourceDate=date[1] if date else None,
                sourceStatus=status[1] if status else None,
                imageUrls=item["imageUrls"],
                reviewStatus="pending",
                independentlyVerified=False,
            )
        )
    return records


def main():
    base = ROOT / "data/acquisition/ppms/projects"
    dossiers = json.loads((base / "balangir-dossiers.json").read_text())["dossiers"]
    selected = []
    areas = set()
    # Review five different panchayats with exact project/bill joins and successful
    # source status. Chandanbhati is the tie-break for the working sample.
    ordered = sorted(
        dossiers,
        key=lambda d: (
            "Chandanbhati" not in (d.get("project") or {}).get("Gram Panchayat / Ulb", ""),
            d["projectCode"],
        ),
    )
    for d in ordered:
        p = d.get("project")
        area = (p or {}).get("Gram Panchayat / Ulb")
        if (
            not p
            or area in areas
            or not p.get("sourceLinks")
            or not any(b["Status"] == "Bill successful from treasury" for b in d["bills"])
        ):
            continue
        areas.add(area)
        selected.append(d)
        if len(selected) == 5:
            break
    result = []
    failures = []
    for d in selected:
        url = d["project"]["sourceLinks"][0]
        p = urlparse(url)
        if p.netloc != "ppms.odisha.gov.in" or not p.path.startswith(
            "/report/geo-tagging-status-detail/"
        ):
            raise ValueError("Unsupported detail link")
        try:
            raw, metadata = source(url, base)
            tags = parse_geotags(raw, d["projectCode"])
            result.append(dict(project=d, geotags=tags, source=metadata, approved=False))
        except Exception as error:
            failures.append(dict(projectCode=d["projectCode"], error=str(error)))
    dossier = dict(
        candidates=result,
        failures=failures,
        approved=False,
        coverage="Five PPMS project candidates in different panchayats; eGramSwaraj crosswalk not assumed",
    )
    (base / "five-panchayat-geotag-assessment.json").write_text(
        json.dumps(dossier, indent=2) + "\n"
    )
    print(
        json.dumps(
            dict(
                candidates=len(result),
                withGeotags=sum(bool(r["geotags"]) for r in result),
                panchayats=[r["project"]["project"]["Gram Panchayat / Ulb"] for r in result],
                failures=failures,
            )
        )
    )


if __name__ == "__main__":
    main()
