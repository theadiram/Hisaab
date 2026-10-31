"""Build a private, searchable source-row catalogue; no payment approvals/totals."""

import hashlib, json, os, sqlite3
from pathlib import Path
from datetime import datetime, timezone
from mplads_payment_assessment import assess
from mplads_state_collection import validate_scope

ROOT = Path(__file__).resolve().parents[1]


def safe_row(record, source_hash):
    return {
        "amount": record["sourceReportedDisbursedRupees"],
        "date": record["expenditureDate"],
        "recipient": record["vendorLabel"],
        "status": record["sourcePaymentStatus"],
        "encodingIssue": record["encodingIssue"],
        "sourceHash": source_hash,
        "sourceRow": record["sourceRowNumber"],
        "transactionId": None,
        "settlementVerified": False,
        "approved": False,
    }


def main():
    base = ROOT / "data/acquisition/mplads/review-catalogue"
    base.mkdir(parents=True, exist_ok=True)
    temporary = base / "catalogue.building.sqlite"
    temporary.unlink(missing_ok=True)
    db = sqlite3.connect(temporary)
    db.executescript(
        "CREATE TABLE projects(id TEXT PRIMARY KEY,house INTEGER,work_id TEXT,state TEXT,titles TEXT,agencies TEXT,text_review INTEGER); CREATE TABLE source_rows(project_id TEXT,payload TEXT); CREATE INDEX rows_project ON source_rows(project_id); CREATE INDEX projects_state ON projects(state,house);"
    )
    projects = {}
    row_count = 0
    verified_sources = 0
    for house, directory in [(2, "state-expenditure"), (1, "rajya-state-expenditure")]:
        folder = ROOT / "data/acquisition/mplads" / directory
        for entry in json.loads((folder / "checkpoint.json").read_text()).values():
            if entry["status"] != "assessed":
                continue
            raw = (folder / entry["file"]).read_bytes()
            if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                raise ValueError("Original checksum mismatch")
            records, _ = assess(raw)
            validate_scope(records, entry["state"], house)
            verified_sources += 1
            for r in records:
                key = f"{house}:{r['workId']}"
                project = projects.setdefault(
                    key,
                    {
                        "house": house,
                        "workId": r["workId"],
                        "state": r["state"],
                        "titles": set(),
                        "agencies": set(),
                        "textReview": False,
                    },
                )
                project["textReview"] = project["textReview"] or r["encodingIssue"]
                project["titles"].add(r["title"] or "Purpose unavailable")
                project["agencies"].add(r["implementingAgency"] or "Agency unavailable")
                db.execute(
                    "INSERT INTO source_rows VALUES (?,?)",
                    (key, json.dumps(safe_row(r, entry["sha256"]), ensure_ascii=True)),
                )
                row_count += 1
    for key, p in projects.items():
        db.execute(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?)",
            (
                key,
                p["house"],
                p["workId"],
                p["state"],
                json.dumps(sorted(p["titles"]), ensure_ascii=True),
                json.dumps(sorted(p["agencies"]), ensure_ascii=True),
                int(p["textReview"]),
            ),
        )
    db.commit()
    db.close()
    os.replace(temporary, base / "catalogue.sqlite")
    summary = {
        "builtAt": datetime.now(timezone.utc).isoformat(),
        "projects": len(projects),
        "sourceRows": row_count,
        "verifiedOriginals": verified_sources,
        "approvedPayments": 0,
        "scope": "Separate house-scoped default MPLADS reports; not all government payments",
    }
    (ROOT / "data/mplads-review-catalogue-assessment.json").write_text(
        json.dumps(summary, indent=2) + "\n"
    )
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
