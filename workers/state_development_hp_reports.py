"""Bounded retrieval using observed public Himachal budget form controls.

No login, private analytics, guessed report endpoint, or CAPTCHA bypass. The normal
form returns an explicit viewer link; binary report responses are preserved.
"""

import argparse, hashlib, http.cookiejar, json, re, urllib.parse, urllib.request, fcntl
from html.parser import HTMLParser
from state_development_collection import BASE, ROOT, extract, write, now, update_summary

HOME = "https://ebudget.hp.nic.in/budhome.aspx"
ACTIONS = {
    "revenue": "lnkRV_X",
    "capital": "lnkC_X",
    "loans": "lnkL_X",
    "grants": "lnkDmdNote",
    "shares": "lnkHOA_StateCentre",
}


class PublicForm(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.select = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "input" and attrs.get("type") == "hidden" and attrs.get("name"):
            self.fields[attrs["name"]] = attrs.get("value", "")
        if tag == "select":
            self.select = attrs.get("name")
        if (
            tag == "option"
            and self.select
            and ("selected" in attrs or self.select not in self.fields)
        ):
            self.fields[self.select] = attrs.get("value", "")

    def handle_endtag(self, tag):
        if tag == "select":
            self.select = None


class OfficialRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        p = urllib.parse.urlparse(newurl)
        if p.scheme != "https" or p.hostname != "ebudget.hp.nic.in" or p.username or p.password:
            raise ValueError("Report redirect outside reviewed official host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def retrieve(action):
    if action not in ACTIONS:
        raise ValueError("Unobserved report control")
    folder = BASE / "2"
    cp = json.loads((folder / "checkpoint.json").read_text())
    ident = "hp-form-" + action + "-2026"
    if any(d["sourceId"] == ident for d in cp["documents"]):
        return {"source": ident, "status": "already_preserved"}
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), OfficialRedirect()
    )
    page = opener.open(HOME, timeout=25).read(2000000).decode()
    form = PublicForm()
    form.feed(page)
    target = "ctl00$ContentPlaceHolder1$" + ACTIONS[action]
    if target not in page or form.fields.get("ctl00$ContentPlaceHolder1$DDLYr") not in [
        "2026",
        "2026-27",
    ]:
        raise ValueError("Observed report control or fiscal selection changed")
    form.fields["__EVENTTARGET"] = target
    form.fields["__EVENTARGUMENT"] = ""
    raw = opener.open(
        urllib.request.Request(HOME, data=urllib.parse.urlencode(form.fields).encode()), timeout=30
    ).read(40000001)
    if not raw.lstrip().startswith(b"%PDF-"):
        html = raw.decode()
        match = re.search(r"window\.open\s*\(\s*['\"]([^'\"]+)", html)
        if not match:
            raise ValueError("No explicit public viewer returned")
        url = urllib.parse.urljoin(HOME, match[1])
        p = urllib.parse.urlparse(url)
        if p.hostname != "ebudget.hp.nic.in" or p.scheme != "https":
            raise ValueError("Viewer host changed")
        raw = opener.open(url, timeout=35).read(40000001)
    else:
        url = HOME
    if len(raw) > 40000000 or not raw.lstrip().startswith(b"%PDF-"):
        raise ValueError("Report export unavailable as PDF; no financial evidence accepted")
    digest = hashlib.sha256(raw).hexdigest()
    original = ROOT / "data/originals/state-development" / digest
    original.write_bytes(raw)
    original.chmod(0o600)
    receipt = {
        "version": "state-development-evidence/1",
        "stateCode": "2",
        "state": "Himachal Pradesh",
        "sourceId": ident,
        "sourceKind": "budget",
        "label": "Himachal Pradesh public " + action + " report, selected FY2026–27",
        "url": url,
        "effectiveUrl": url,
        "contextUrl": HOME,
        "sourceFormAction": ACTIONS[action],
        "selectedFinancialYear": "2026-27",
        "sha256": digest,
        "original": str(original.relative_to(ROOT)),
        "bytes": len(raw),
        "retrievedAt": now(),
        "financialYearHints": ["2025-2026", "2026-2027"],
        "permissionStatus": "review_pending",
        "publication": "private_only",
        "contentType": "application/pdf",
        "intakeObjectFits": len(raw) <= 10000000,
    }
    evidence = extract(raw, receipt)
    ep = folder / (digest + ".json")
    write(ep, evidence)
    receipt.update(
        extraction=str(ep.relative_to(ROOT)),
        sourceTables=len(evidence.get("tables", [])),
        numericLines=evidence["numericLines"],
        extractedPages=len(evidence["pages"]),
        completeExtraction=evidence["completeExtraction"],
    )
    with (folder / ".collection.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        cp = json.loads((folder / "checkpoint.json").read_text())
        cp["documents"].append(receipt)
        cp["failures"] = [f for f in cp["failures"] if f["sourceId"] != ident]
        cp["updatedAt"] = now()
        write(folder / "checkpoint.json", cp)
    update_summary()
    return {"source": ident, "status": "preserved_private", "pages": receipt["extractedPages"]}


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--report", choices=ACTIONS, required=True)
    args = p.parse_args()
    try:
        print(json.dumps(retrieve(args.report)))
    except Exception as exc:
        folder = BASE / "2"
        with (folder / ".collection.lock").open("a") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            cp = json.loads((folder / "checkpoint.json").read_text())
            ident = "hp-form-" + args.report + "-2026"
            cp["failures"] = [f for f in cp["failures"] if f["sourceId"] != ident] + [
                {"sourceId": ident, "url": HOME, "error": str(exc)[:240], "checkedAt": now()}
            ]
            write(folder / "checkpoint.json", cp)
        update_summary()
        print(json.dumps({"source": ident, "status": "unavailable", "error": str(exc)[:240]}))
        raise SystemExit(1)
