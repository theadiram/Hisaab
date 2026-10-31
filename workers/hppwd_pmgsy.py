"""Extract the HPPWD PMGSY-III May 2025 report into private review candidates.

The report does not label the currency scale. Preserve raw cost cells, leave all
normalized amounts unknown, and block publication until permission, units and
LGD identity are independently established. Never join the separately printed
contractor columns by page/row position.
"""

import argparse, hashlib, json, re
from pathlib import Path
from datetime import datetime, timezone
import pdfplumber
from ingest import ROOT, DATA, ACQUISITION, atomic_json

URL = "https://hppwd.hp.gov.in/sites/default/files/MISC/PMGSY-III%202025.pdf"
POLICY = "https://hppwd.hp.gov.in/copyright-policy"
VERSION = "hppwd-pmgsy-iii-2025/v1"
COLUMNS = [
    "serial",
    "district",
    "implementation_unit",
    "block",
    "package",
    "sanction_year",
    "work_type",
    "name",
    "sanction_cost_raw",
    "state_cost_raw",
    "road_km",
    "bridge_m",
    "completed_road_km",
]


def clean(value):
    return re.sub(r"\s+", " ", value or "").strip()


def extract(file):
    original = Path(file).read_bytes()
    digest = hashlib.sha256(original).hexdigest()
    retrieved = datetime.now(timezone.utc).isoformat()
    records = []
    quarantine = []
    skipped = []
    with pdfplumber.open(file) as pdf:
        if len(pdf.pages) != 58:
            raise ValueError("Report edition changed: expected 58 pages")
        for number, page in enumerate(pdf.pages, 1):
            for table in page.extract_tables():
                if not table:
                    continue
                if len(table[0]) != 13:
                    skipped.append(
                        {
                            "page": number,
                            "reason": "Separate contractor columns: no row identity to support joining",
                        }
                    )
                    continue
                for cells in table:
                    if not clean(cells[0]).isdigit():
                        continue
                    row = dict(zip(COLUMNS, map(clean, cells)))
                    locator = f"PDF page {number}; serial {row['serial']}; package {row['package']}"
                    if (
                        not re.fullmatch(r"\d{4} - \d{4}", row["sanction_year"])
                        or row["work_type"] not in ("ROAD", "LSB")
                        or not row["name"]
                        or not row["package"]
                    ):
                        quarantine.append(
                            {"locator": locator, "reason": "Identity/schema mismatch", "raw": row}
                        )
                        continue
                    # Package alone is not a work ID: several bridge components share it.
                    identity = "|".join(
                        [
                            row["district"],
                            row["package"],
                            row["sanction_year"],
                            row["work_type"],
                            row["name"],
                        ]
                    )
                    receipt = {
                        "id": f"{digest[:12]}:{row['serial']}",
                        "title": "HPPWD PMGSY-III work report, generated 14 May 2025",
                        "url": URL,
                        "documentHash": digest,
                        "locator": locator,
                        "retrievedAt": retrieved[:10],
                        "rawText": json.dumps(row, ensure_ascii=False),
                        "permission": "Pending written reproduction permission; private review only",
                    }
                    stages = [
                        {
                            "id": "sanction",
                            "label": "Sanction",
                            "state": "pending",
                            "date": None,
                            "amount": None,
                            "description": "Source records a sanction cost but does not establish its currency scale. Amount remains unknown.",
                            "receipts": [receipt],
                        }
                    ]
                    for stage, label in [
                        ("award", "Award"),
                        ("payment", "Payment"),
                        ("completion", "Completion"),
                    ]:
                        stages.append(
                            {
                                "id": stage,
                                "label": label,
                                "state": "inaccessible",
                                "date": None,
                                "amount": None,
                                "description": "This extracted table does not establish this stage. Completed road length is not a completion certificate.",
                                "receipts": [],
                            }
                        )
                    records.append(
                        {
                            "id": hashlib.sha256(("hppwd-pmgsy:" + identity).encode()).hexdigest()[
                                :24
                            ],
                            "title": row["name"],
                            "purpose": "Roads",
                            "state": "Himachal Pradesh",
                            "district": row["district"],
                            "areaId": "",
                            "financialYear": row["sanction_year"].replace(" ", ""),
                            "officialIds": [row["package"]],
                            "location": None,
                            "locationPrecision": "unknown",
                            "authority": row["implementation_unit"],
                            "authorityReceipt": receipt,
                            "physicalVerification": "Not independently verified",
                            "summary": "Official source extraction awaiting permission, units, geography and evidence review.",
                            "demo": False,
                            "stages": stages,
                            "money": [],
                            "review": {
                                "state": "pending",
                                "documentHash": digest,
                                "mappingVersion": VERSION,
                                "raw": row,
                                "blockers": [
                                    "Written source reproduction permission",
                                    "Sanction cost currency scale",
                                    "Official district identity",
                                    "Work/component identity review",
                                ],
                            },
                        }
                    )
    serials = [int(w["review"]["raw"]["serial"]) for w in records]
    if sorted(serials) != list(range(1, 321)):
        raise ValueError(
            "Report is incomplete or duplicated: expected every serial 1–320 exactly once"
        )
    if len({w["id"] for w in records}) != len(records):
        raise ValueError("Repeated composite identity needs reconciliation")
    destination = DATA / "originals" / "hppwd-pmgsy" / digest
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(original)
    manifest = {
        "sourceId": "hppwd-pmgsy",
        "sha256": digest,
        "url": URL,
        "permission": "pending",
        "permissionStatus": "pending",
        "termsUrl": POLICY,
        "partition": "Himachal Pradesh / PMGSY-III / generated 2025-05-14",
        "retrievedAt": retrieved,
        "original": str(destination.relative_to(ROOT)),
        "contentType": "application/pdf",
        "state": "private_review_only",
    }
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", manifest)
    atomic_json(
        ACQUISITION / "candidates" / f"{digest}.json",
        {
            "sourceId": "hppwd-pmgsy",
            "documentHash": digest,
            "candidates": records,
            "quarantine": quarantine,
            "skippedTables": skipped,
            "extractedAt": retrieved,
        },
    )
    return {
        "sha256": digest,
        "candidates": len(records),
        "districtNames": len({w["district"] for w in records}),
        "normalizedFinancialEvents": 0,
        "publication": "blocked_pending_permission_units_geography_review",
        "skippedUnmatchedContractorTables": len(skipped),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file")
    args = parser.parse_args()
    print(json.dumps(extract(args.file)))
