"""Stage custodian exports privately; never approve payments or infer settlement.

Inputs must be explicitly mapped to the proposed department export columns.
Existing official IDs and allocation references are mandatory for joins.
"""

import argparse
import csv
import hashlib
import io
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSER_VERSION = "department-payment-export-v1"
PAYMENT_COLUMNS = set(
    "source_system source_payment_id bill_voucher_id component_id recorded_status initiation_date treasury_date cheque_date recipient_credit_return_date payee_label payee_role flow_type gross_amount deduction_amount net_amount currency source_unit reversal_of reissue_of reporting_cutoff evidence_reference".split()
)
ALLOCATION_COLUMNS = set(
    "source_system source_payment_id component_id official_project_id allocated_amount currency source_unit amount_basis allocation_evidence_reference".split()
)
PROJECT_COLUMNS = set(
    "source_system official_project_id project_name location_reference project_evidence_reference".split()
)
DATE_FORMATS = {"iso": "%Y-%m-%d", "dmy-slash": "%d/%m/%Y", "dmy-dash": "%d-%m-%Y"}


def source_amount(raw, unit):
    if unit not in ("rupees", "lakh", "crore"):
        raise ValueError("Explicit source amount unit required")
    raw = raw.strip().replace(",", "")
    if not re.fullmatch(r"-?\d{1,18}(?:\.\d{1,9})?", raw):
        raise ValueError("Invalid source decimal amount")
    value = Decimal(raw) * {"rupees": 1, "lakh": 100000, "crore": 10000000}[unit]
    if value != value.quantize(Decimal(".01")):
        raise ValueError("Fractional paise; do not round source amounts")
    return format(value, ".2f")


def key(row):
    return row["source_system"], row["source_payment_id"], row.get("component_id", "")


def exact_records(rows, identity, table, quarantine):
    groups = defaultdict(list)
    duplicates = 0
    for line, row in enumerate(rows, 2):
        groups[identity(row)].append((line, row))
    result = []
    for group in groups.values():
        if len({json.dumps(r, sort_keys=True) for _, r in group}) > 1:
            quarantine.extend(
                dict(
                    table=table,
                    line=line,
                    reason="Conflicting editions of the same source identity",
                )
                for line, _ in group
            )
        else:
            duplicates += len(group) - 1
            result.append(group[0])
    return result, duplicates


def normalize(projects, payments, allocations, date_format):
    if date_format not in DATE_FORMATS:
        raise ValueError("Explicit date format required; dates are not guessed")
    quarantine = []
    project_index = {}
    project_rows, project_duplicates = exact_records(
        projects, lambda r: (r["source_system"], r["official_project_id"]), "projects", quarantine
    )
    for line, row in project_rows:
        if (
            not row["source_system"]
            or not row["official_project_id"]
            or not row.get("project_evidence_reference")
        ):
            quarantine.append(
                dict(
                    table="projects",
                    line=line,
                    reason="Official project identity/evidence reference missing",
                )
            )
        else:
            project_index[(row["source_system"], row["official_project_id"])] = row
    payment_rows, payment_duplicates = exact_records(payments, key, "payments", quarantine)
    records = {}
    for line, row in payment_rows:
        try:
            if not all(
                row.get(f)
                for f in (
                    "source_system",
                    "source_payment_id",
                    "bill_voucher_id",
                    "evidence_reference",
                )
            ):
                raise ValueError("Stable payment/bill identity and source reference required")
            if row.get("currency") != "INR":
                raise ValueError("Explicit INR currency required")
            amounts = {
                f: source_amount(row[f], row["source_unit"]) if row.get(f) else None
                for f in ("gross_amount", "deduction_amount", "net_amount")
            }
            if not any(v is not None for v in amounts.values()):
                raise ValueError("No recorded financial amount")
            if all(v is not None for v in amounts.values()) and Decimal(
                amounts["gross_amount"]
            ) - Decimal(amounts["deduction_amount"]) != Decimal(amounts["net_amount"]):
                raise ValueError(
                    "Gross minus deductions differs from recorded net; retain conflict"
                )
            if any(Decimal(v) < 0 for v in amounts.values() if v is not None) and not row.get(
                "reversal_of"
            ):
                raise ValueError("Negative amount lacks documented reversal reference")
            if (
                row.get("reversal_of") == row["source_payment_id"]
                or row.get("reissue_of") == row["source_payment_id"]
            ):
                raise ValueError("Self-referencing reversal/reissue")
            dates = {}
            for field in (
                "initiation_date",
                "treasury_date",
                "cheque_date",
                "recipient_credit_return_date",
                "reporting_cutoff",
            ):
                raw = row.get(field, "")
                dates[field] = dict(
                    sourceText=raw or None,
                    iso=datetime.strptime(raw, DATE_FORMATS[date_format]).date().isoformat()
                    if raw
                    else None,
                )
            identity = key(row)
            records[identity] = dict(
                sourceIdentity=list(identity),
                canonicalId=hashlib.sha256(json.dumps(identity).encode()).hexdigest(),
                billVoucherId=row["bill_voucher_id"],
                sourceAmounts={f: row.get(f) or None for f in amounts},
                amountsINR=amounts,
                sourceUnit=row["source_unit"],
                sourceDates=dates,
                sourceStatus=row.get("recorded_status") or None,
                sourcePayee=row.get("payee_label") or None,
                sourcePayeeRole=row.get("payee_role") or None,
                sourceFlowType=row.get("flow_type") or "unclassified",
                evidenceReference=row["evidence_reference"],
                reversalOf=row.get("reversal_of") or None,
                reissueOf=row.get("reissue_of") or None,
                allocations=[],
                settlementDate=None,
                approved=False,
                settlementVerified=False,
                reviewStatus="pending",
            )
        except (ValueError, KeyError) as error:
            quarantine.append(dict(table="payments", line=line, reason=str(error)))
    shares = defaultdict(list)
    allocation_rows, allocation_duplicates = exact_records(
        allocations,
        lambda r: (
            key(r),
            r["official_project_id"],
            r.get("amount_basis"),
            r.get("allocation_evidence_reference"),
        ),
        "allocations",
        quarantine,
    )
    bad_share_keys = set()
    for line, row in allocation_rows:
        identity = key(row)
        try:
            if identity not in records:
                raise ValueError("No unambiguous exact source payment/component identity")
            if (row["source_system"], row["official_project_id"]) not in project_index:
                raise ValueError("No exact official project identity; names/proximity cannot join")
            if not row.get("allocation_evidence_reference"):
                raise ValueError("Documented project allocation reference required")
            if row.get("currency") != "INR" or row.get("amount_basis") not in ("gross", "net"):
                raise ValueError("Explicit allocation currency and gross/net basis required")
            amount = source_amount(row["allocated_amount"], row["source_unit"])
            parent = records[identity]["amountsINR"][row["amount_basis"] + "_amount"]
            if parent is None:
                raise ValueError("Allocation basis has no matching recorded payment amount")
            if Decimal(amount) * Decimal(parent) < 0:
                raise ValueError("Allocation and payment signs differ")
            shares[(identity, row["amount_basis"])].append(
                (
                    line,
                    dict(
                        projectId=row["official_project_id"],
                        amountINR=amount,
                        allocationId=hashlib.sha256(
                            json.dumps(
                                [
                                    identity,
                                    row["official_project_id"],
                                    row["amount_basis"],
                                    row["allocation_evidence_reference"],
                                ]
                            ).encode()
                        ).hexdigest(),
                        sourceAmount=row["allocated_amount"],
                        sourceUnit=row["source_unit"],
                        amountBasis=row["amount_basis"],
                        evidenceReference=row["allocation_evidence_reference"],
                        approved=False,
                    ),
                )
            )
        except (ValueError, KeyError) as error:
            bad_share_keys.add(identity)
            quarantine.append(dict(table="allocations", line=line, reason=str(error)))
    for (identity, basis), entries in shares.items():
        total = sum((Decimal(e["amountINR"]) for _, e in entries), Decimal(0))
        parent = Decimal(records[identity]["amountsINR"][basis + "_amount"])
        if abs(total) > abs(parent):
            bad_share_keys.add(identity)
            quarantine.extend(
                dict(
                    table="allocations",
                    line=line,
                    reason="Allocated shares exceed recorded payment; full package amount must not be copied to each project",
                )
                for line, _ in entries
            )
        else:
            for _, entry in entries:
                entry["coversRecordedAmount"] = total == parent
                records[identity]["allocations"].append(entry)
    for identity, record in records.items():
        if identity in bad_share_keys:
            record["allocations"] = []
        record["allocationReview"] = (
            "quarantined"
            if identity in bad_share_keys
            else "exact_ids_unreviewed"
            if record["allocations"]
            else "missing"
        )
        record["publicationReady"] = False
    return dict(
        records=list(records.values()),
        quarantine=quarantine,
        duplicatesExcluded=project_duplicates + payment_duplicates + allocation_duplicates,
        approvedPayments=0,
    )


def read_csv(raw, allowed, required):
    if len(raw) > 20000000:
        raise ValueError("Export exceeds 20 MB bound")
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    fields = set(reader.fieldnames or [])
    if not required <= fields or fields - allowed:
        raise ValueError(
            "Map export to declared columns; sensitive or unexpected columns are not accepted"
        )
    rows = []
    for row in reader:
        if None in row:
            raise ValueError("CSV row has undeclared extra fields")
        rows.append({k: (v or "").strip() for k, v in row.items()})
    return rows


def main():
    parser = argparse.ArgumentParser()
    for name in ("projects", "payments", "allocations", "metadata"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    raw = {
        name: getattr(args, name).read_bytes()
        for name in ("projects", "payments", "allocations", "metadata")
    }
    if any(len(value) > 20000000 for value in raw.values()):
        raise ValueError("Export exceeds 20 MB bound")
    hashes = {name: hashlib.sha256(value).hexdigest() for name, value in raw.items()}
    import_id = hashlib.sha256(
        json.dumps(dict(hashes=hashes, parserVersion=PARSER_VERSION), sort_keys=True).encode()
    ).hexdigest()
    folder = ROOT / "data/acquisition/department-exports" / import_id
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    assessment = folder / "assessment.json"
    if assessment.exists():
        for name, checksum in hashes.items():
            if hashlib.sha256((folder / (name + ".original")).read_bytes()).hexdigest() != checksum:
                raise ValueError("Previously preserved export checksum mismatch")
        if (
            hashlib.sha256(assessment.read_bytes()).hexdigest()
            != (folder / "assessment.sha256").read_text().strip()
        ):
            raise ValueError("Private assessment changed; retain a reviewed revision separately")
        print(json.dumps(dict(importId=import_id, repeated=True, approvedPayments=0)))
        return
    for name, value in raw.items():
        target = folder / (name + ".original")
        target.write_bytes(value)
        target.chmod(0o600)
    metadata = json.loads(raw["metadata"])
    if not all(
        metadata.get(k)
        for k in ("sourceReference", "fieldDefinitionsReference", "scopeDescription", "dateFormat")
    ):
        raise ValueError(
            "Document source, field-definition reference, scope and date format before staging"
        )
    result = normalize(
        read_csv(
            raw["projects"],
            PROJECT_COLUMNS,
            {"source_system", "official_project_id", "project_evidence_reference"},
        ),
        read_csv(
            raw["payments"],
            PAYMENT_COLUMNS,
            {
                "source_system",
                "source_payment_id",
                "bill_voucher_id",
                "currency",
                "source_unit",
                "evidence_reference",
            },
        ),
        read_csv(
            raw["allocations"],
            ALLOCATION_COLUMNS,
            {
                "source_system",
                "source_payment_id",
                "official_project_id",
                "allocated_amount",
                "currency",
                "source_unit",
                "amount_basis",
                "allocation_evidence_reference",
            },
        ),
        metadata["dateFormat"],
    )
    result.update(
        importId=import_id,
        originalHashes=hashes,
        sourceReference=metadata["sourceReference"],
        parserVersion=PARSER_VERSION,
        fieldDefinitionsReference=metadata["fieldDefinitionsReference"],
        scopeDescription=metadata["scopeDescription"],
        stagedAt=datetime.now(timezone.utc).isoformat(),
        reuseReviewed=False,
        limitation="Private staging only. Dates retain their source roles; no recipient settlement, geography, permissions or publication approval inferred.",
    )
    assessment.write_text(json.dumps(result, indent=2) + "\n")
    assessment.chmod(0o600)
    (folder / "assessment.sha256").write_text(
        hashlib.sha256(assessment.read_bytes()).hexdigest() + "\n"
    )
    print(
        json.dumps(
            dict(
                importId=import_id,
                stagedRecords=len(result["records"]),
                quarantinedRows=len(result["quarantine"]),
                approvedPayments=0,
            )
        )
    )


if __name__ == "__main__":
    main()
