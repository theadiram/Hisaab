"""Preserve the JJM dashboard's visible-year state financial responses privately.

These are context reports, not work identities, bills or payment transactions.
The parameter encoding reproduces the official public dashboard JavaScript.
"""

import hashlib, json, time, urllib.parse, urllib.request
from decimal import Decimal
from ingest import DATA, ACQUISITION, ROOT, atomic_json, now

URL = "https://ejalshakti.gov.in/jjmreport/JJMIndia.aspx"
ENDPOINT = URL + "/Bind_BudjectSanction_Details"
YEARS = ["2019-2020", "2020-2021", "2021-2022", "2022-2023", "2023-2024"]


def encode(value):
    return urllib.parse.quote("".join(chr(ord(c) + 1) for c in str(value)), safe="@*_+-./") + "1"


def validate(response):
    rows = response.get("d")
    if not isinstance(rows, list) or not rows:
        raise ValueError("No assessed financial response; never treat placeholders as zero")
    seen = set()
    for row in rows:
        identity = row.get("KeyValue")
        name = row.get("Name")
        amount = Decimal(str(row.get("Amount")))
        if not identity or not name or identity in seen or not amount.is_finite() or amount < 0:
            raise ValueError("Invalid or conflicting JJM financial context")
        seen.add(identity)
    return rows


def run():
    reports = []
    for year in YEARS:
        parameters = {"StCode11": "0", "Cat": "0", "SubCat": "0", "Param": "0", "FinYear": year}
        encoded = {k: encode(v) for k, v in parameters.items()}
        request = urllib.request.Request(
            ENDPOINT,
            data=json.dumps(encoded).encode(),
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "Referer": URL,
                "User-Agent": "Hisaab source assessment",
            },
        )
        with urllib.request.urlopen(request, timeout=35) as response:
            raw = response.read(2 * 1024 * 1024 + 1)
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError("Unexpected response size")
        rows = validate(json.loads(raw))
        digest = hashlib.sha256(raw).hexdigest()
        original = DATA / "originals" / "jjm-financial" / digest
        original.parent.mkdir(parents=True, exist_ok=True)
        original.write_bytes(raw)
        manifest = {
            "sourceId": "jjm-financial",
            "sourceName": "Jal Jeevan Mission dashboard financial context",
            "sourceFamily": "water_financial_context",
            "sha256": digest,
            "url": ENDPOINT,
            "contextUrl": URL,
            "contentType": "application/json",
            "original": str(original.relative_to(ROOT)),
            "retrievedAt": now(),
            "parserVersion": "jjm-state-financial-context-v1",
            "query": parameters,
            "encodedQuery": encoded,
            "permissionStatus": "unverified",
            "permission": "Private source assessment only; reproduction permission not established.",
            "scope": "State-level dashboard financial context; not contractor payments or individual works.",
            "financialSemantics": "Amount field; dashboard default header Release (Rs in Crore). Exact release/drawdown semantics await original financial-report review.",
        }
        atomic_json(ACQUISITION / "documents" / f"{digest}.json", manifest)
        reports.append(
            {"year": year, "rows": len(rows), "sha256": digest, "status": "original_preserved"}
        )
        time.sleep(1)
    atomic_json(
        DATA / "jjm-acquisition.json",
        {
            "sourceUrl": URL,
            "reports": reports,
            "yearsAssessed": YEARS,
            "sourceRows": sum(r["rows"] for r in reports),
            "scope": "State financial context only",
            "publication": "private_pending_review",
            "hostedOriginalsVerified": False,
        },
    )
    print(
        json.dumps(
            {
                "reports": len(reports),
                "sourceRows": sum(r["rows"] for r in reports),
                "scope": "state_financial_context_not_work_payments",
            }
        )
    )


if __name__ == "__main__":
    run()
