"""Assess declared public OMMAS reports; preserve bytes, never infer payments."""

import html, hashlib, json, re, http.cookiejar, urllib.request, urllib.parse
from html.parser import HTMLParser
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://pmgsy.dord.gov.in"


class Form(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.select = None
        self.options = {}

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "input" and d.get("name") and d.get("type") == "hidden":
            self.fields[d["name"]] = d.get("value", "")
        if tag == "select":
            self.select = d.get("name")
            self.options[self.select] = []
        if tag == "option" and self.select:
            v = d.get("value", "")
            self.options[self.select].append(v)
            if self.select not in self.fields or "selected" in d:
                self.fields[self.select] = v

    def handle_endtag(self, tag):
        if tag == "select":
            self.select = None


def html_module_unescape(value):
    return html.unescape(value)


def run():
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    folder = ROOT / "data/acquisition/ommas-financial"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).isoformat()
    inventory = []

    def fetch(route, name, fields=None):
        url = BASE + route
        req = urllib.request.Request(
            url,
            data=urllib.parse.urlencode(fields).encode() if fields else None,
            headers={"User-Agent": "Hisaab public report assessment", "Referer": BASE + "/"},
        )
        with opener.open(req, timeout=30) as r:
            raw = r.read(20000001)
            ctype = r.headers.get("Content-Type", "")
            status = r.status
        if len(raw) > 20000000:
            raise ValueError("Report exceeds bounded assessment limit")
        digest = hashlib.sha256(raw).hexdigest()
        target = ROOT / "data/originals/ommas-financial" / digest
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        (folder / (name + ".html")).write_bytes(raw)
        safe = {k: v for k, v in (fields or {}).items() if "token" not in k.lower()}
        entry = {
            "name": name,
            "url": url,
            "method": "POST" if fields else "GET",
            "query": safe,
            "sha256": digest,
            "bytes": len(raw),
            "contentType": ctype,
            "status": status,
            "retrievedAt": stamp,
            "original": str(target.relative_to(ROOT)),
        }
        inventory.append(entry)
        return raw.decode("utf-8-sig", errors="replace")

    policy = fetch("/Home/HomeCopyrightPolicy/", "copyright-policy")
    permission = (
        "accurate_attributed_text_and_data_reuse"
        if all(
            x in policy
            for x in (
                "You may reproduce the text and data",
                "without asking us first",
                "not in a misleading context",
            )
        )
        else "needs_review"
    )
    for name, layout, report in [
        (
            "final-bill-abstract",
            "/AccountArea/Account/FinalBillPaymentAbstractLayout",
            "/AccountArea/Account/FinalBillPaymentAbstractReport/",
        ),
        (
            "completed-road-value",
            "/ProposalArea/Proposal/CompletedRoadValueLayout",
            "/ProposalArea/Proposal/CompletedRoadValueReport/",
        ),
    ]:
        try:
            html = fetch(layout, name + "-layout")
            f = Form()
            f.feed(html)
            if name == "completed-road-value":
                f.fields.update(StateCode="26", StateName="Odisha", Year="2020")
            result = fetch(report, name + "-report", f.fields)
            inventory[-1]["reportFrames"] = re.findall(
                r"<iframe[^>]*src=[\"\x27]([^\"\x27]+)", result, re.I
            )
            frames = inventory[-1]["reportFrames"]
            inventory[-1]["assessment"] = (
                "Report wrapper only; inspect declared report delivery before claiming rows or payments"
            )
            for i, frame in enumerate(frames):
                view = fetch(html_module_unescape(frame), name + "-viewer-" + str(i))
                inventory[-1]["assessment"] = (
                    "Viewer HTML; report tables must be inspected before treating as financial evidence"
                )
        except Exception as e:
            inventory.append(
                {"name": name, "status": "failed", "reason": type(e).__name__ + ": " + str(e)[:160]}
            )
    result = {
        "checkedAt": stamp,
        "sourceUrl": BASE,
        "permission": permission,
        "policyUrl": BASE + "/Home/HomeCopyrightPolicy/",
        "reports": inventory,
        "paymentRecordsAcquired": 0,
        "publication": "no_financial_records_published",
    }
    (folder / "assessment.json").write_text(json.dumps(result, indent=2) + "\n")
    print(
        json.dumps(
            {
                "permission": permission,
                "reports": [
                    {
                        "name": x["name"],
                        "bytes": x.get("bytes"),
                        "status": x["status"],
                        "frames": len(x.get("reportFrames", [])),
                    }
                    for x in inventory
                ],
            }
        )
    )


if __name__ == "__main__":
    run()
