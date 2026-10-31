"""Audit observed budget-document URLs, not a complete government spending census.

Accounts for every saved index link, including uncollected/failed reports. This
prevents a bounded download batch from being described as a whole budget edition.
"""

import json, re
from urllib.parse import urlparse
from state_development_collection import BASE, ROOT, STATES, write, now, expects_pdf


def observed_reports(index, extraction, documents, failures):
    host = urlparse(index["effectiveUrl"]).hostname
    urls = {
        r["url"]: r
        for r in extraction.get("links", [])
        if expects_pdf(r["url"])
        and (
            urlparse(r["url"]).hostname == host
            or (urlparse(r["url"]).hostname or "").endswith(".s3waas.gov.in")
            or urlparse(r["url"]).hostname == "d7i5wg8xwe4hf.cloudfront.net"
        )
    }
    rows = []
    for url, link in sorted(urls.items()):
        preserved = [
            d for d in documents if d["url"] == url and d["contentType"] == "application/pdf"
        ]
        failed = [f for f in failures if f["url"] == url]
        rows.append(
            {
                "url": url,
                "label": link["label"],
                "status": "original_preserved"
                if preserved
                else "source_failed"
                if failed
                else "awaiting_collection",
                "sourceHashes": sorted({d["sha256"] for d in preserved}),
                "fiscalEditionStatus": "requires_original_heading_review",
                "financialClassificationStatus": "not_established_by_index",
                "completePaymentCoverage": False,
            }
        )
    return rows


def main():
    reports = []
    for code, name in STATES:
        folder = BASE / code
        cp = json.loads((folder / "checkpoint.json").read_text())
        indices = []
        documents = cp["documents"] + cp.get("previousEditions", [])
        for index in cp["documents"]:
            if index["sourceKind"] != "budget_index":
                continue
            extraction = json.loads((ROOT / index["extraction"]).read_text())
            rows = observed_reports(index, extraction, documents, cp["failures"])
            indices.append(
                {
                    "sourceId": index["sourceId"],
                    "indexHash": index["sha256"],
                    "observedReports": len(rows),
                    "preservedReports": sum(r["status"] == "original_preserved" for r in rows),
                    "rows": rows,
                    "scope": "Observed index links only; not every department/project or final fiscal-edition validation",
                }
            )
        report = {
            "stateCode": code,
            "state": name,
            "checkedAt": now(),
            "indices": indices,
            "completeCoverage": False,
        }
        write(folder / "source-inventory.json", report)
        reports.append(
            {
                "stateCode": code,
                "state": name,
                "indices": len(indices),
                "observedReports": sum(i["observedReports"] for i in indices),
                "awaitingCollection": sum(
                    r["status"] == "awaiting_collection" for i in indices for r in i["rows"]
                ),
                "failedReports": sum(
                    r["status"] == "source_failed" for i in indices for r in i["rows"]
                ),
            }
        )
    write(
        BASE / "source-inventory-summary.json",
        {"checkedAt": now(), "states": reports, "completeCoverage": False},
    )
    print(
        json.dumps(
            {
                "statesChecked": len(reports),
                "indexReferences": sum(s["indices"] for s in reports),
                "uncollectedIndexLinks": sum(s["awaitingCollection"] for s in reports),
                "failedIndexLinks": sum(s["failedReports"] for s in reports),
            }
        )
    )


if __name__ == "__main__":
    main()
