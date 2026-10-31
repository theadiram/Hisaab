"""Reconcile preserved department export editions privately, without approval."""

import hashlib
import json
import csv
import io
from collections import defaultdict
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYMENT_FIELDS = (
    "sourceIdentity",
    "canonicalId",
    "billVoucherId",
    "sourceAmounts",
    "amountsINR",
    "sourceUnit",
    "sourceDates",
    "sourceStatus",
    "sourcePayee",
    "sourcePayeeRole",
    "sourceFlowType",
    "evidenceReference",
    "reversalOf",
    "reissueOf",
)


def reconcile(editions):
    groups = defaultdict(list)
    blocked = {
        tuple(identity) for e in editions for identity in e.get("blockedSourceIdentities", [])
    }
    for edition in editions:
        for record in edition["records"]:
            identity = tuple(record["sourceIdentity"])
            if len(identity) != 3 or not identity[0] or not identity[1]:
                raise ValueError("Malformed source payment identity")
            groups[identity].append((edition["importId"], record))
    results = []
    for identity, versions in sorted(groups.items()):
        issues = []
        if identity in blocked:
            issues.append("Another preserved export quarantines this source identity")
        signatures = {
            json.dumps({k: r.get(k) for k in PAYMENT_FIELDS}, sort_keys=True) for _, r in versions
        }
        if len(signatures) != 1:
            issues.append("Conflicting payment editions; no preferred amount or date inferred")
        if any(r.get("allocationReview") == "quarantined" for _, r in versions):
            issues.append("An import quarantines this payment allocation")
        allocations = {}
        for import_id, record in versions:
            for share in record["allocations"]:
                key = share["allocationId"]
                fact = {
                    k: share[k]
                    for k in (
                        "allocationId",
                        "projectId",
                        "amountINR",
                        "sourceAmount",
                        "sourceUnit",
                        "amountBasis",
                        "evidenceReference",
                    )
                }
                if key in allocations and allocations[key]["fact"] != fact:
                    issues.append("Conflicting editions of an allocation identity")
                else:
                    allocations.setdefault(key, dict(fact=fact, importIds=set()))["importIds"].add(
                        import_id
                    )
        base = versions[0][1]
        # Multiple references for the same project/basis may be revised statements
        # rather than extra shares. Do not sum these without custodian evidence.
        by_project = defaultdict(set)
        for key, entry in allocations.items():
            fact = entry["fact"]
            by_project[(fact["projectId"], fact["amountBasis"])].add(key)
        if any(len(keys) > 1 for keys in by_project.values()):
            issues.append("Overlapping project allocation references require review")
        coverage = {}
        for basis in ("gross", "net"):
            shares = [a["fact"] for a in allocations.values() if a["fact"]["amountBasis"] == basis]
            if not shares:
                continue
            parent = base["amountsINR"][basis + "_amount"]
            total = sum((Decimal(s["amountINR"]) for s in shares), Decimal(0))
            if parent is None or abs(total) > abs(Decimal(parent)):
                issues.append("Combined export allocations exceed their recorded payment basis")
            if parent is not None and any(
                Decimal(s["amountINR"]) * Decimal(parent) < 0 for s in shares
            ):
                issues.append("Combined allocation signs conflict with their payment")
            coverage[basis] = dict(
                allocatedAmountINR=format(total, ".2f"),
                recordedAmountINR=parent,
                coversRecordedAmount=parent is not None and total == Decimal(parent),
            )
        # Safe owner view: omit payee labels, raw originals, free-text provenance,
        # credentials and any future sensitive fields in the source assessment.
        issues = sorted(set(issues))
        results.append(
            dict(
                sourceIdentity=list(identity),
                canonicalId=base["canonicalId"],
                importIds=sorted({i for i, _ in versions}),
                editionCount=len(versions),
                duplicateEditionsExcluded=len(versions) - 1 if len(signatures) == 1 else 0,
                status="conflicting" if issues else "unreviewed",
                issues=issues,
                billVoucherId=base["billVoucherId"] if len(signatures) == 1 else None,
                amountsINR=base["amountsINR"] if len(signatures) == 1 else None,
                sourceDates=base["sourceDates"] if len(signatures) == 1 else None,
                sourceStatus=base["sourceStatus"] if len(signatures) == 1 else None,
                sourceFlowType=base["sourceFlowType"] if len(signatures) == 1 else None,
                allocations=[
                    dict(
                        allocationId=a["fact"]["allocationId"],
                        projectId=a["fact"]["projectId"],
                        amountINR=a["fact"]["amountINR"],
                        amountBasis=a["fact"]["amountBasis"],
                        importIds=sorted(a["importIds"]),
                    )
                    for _, a in sorted(allocations.items())
                ],
                allocationCoverage=coverage if not issues else {},
                approved=False,
                settlementVerified=False,
                publicationReady=False,
            )
        )
    return dict(
        schemaVersion=1,
        imports=len(editions),
        records=results,
        sourceRows=sum(len(e["records"]) for e in editions),
        uniquePayments=len(results),
        conflictingPayments=sum(r["status"] == "conflicting" for r in results),
        linkedUnreviewedPayments=sum(
            r["status"] == "unreviewed" and bool(r["allocations"]) for r in results
        ),
        quarantinedImportRows=sum(len(e.get("quarantine", [])) for e in editions),
        approvedPayments=0,
        limitation="Private source records, not published payments. No amount totals, settlement or site approval inferred.",
    )


def load_editions(base):
    editions = []
    for folder in sorted(base.glob("*")):
        if not folder.is_dir() or len(folder.name) != 64:
            continue
        assessment = folder / "assessment.json"
        if not assessment.exists():
            continue
        raw = assessment.read_bytes()
        if hashlib.sha256(raw).hexdigest() != (folder / "assessment.sha256").read_text().strip():
            raise ValueError("Private assessment checksum mismatch")
        edition = json.loads(raw)
        if edition["importId"] != folder.name:
            raise ValueError("Export directory identity mismatch")
        if set(edition["originalHashes"]) != {"projects", "payments", "allocations", "metadata"}:
            raise ValueError("Missing original export types")
        for name, checksum in edition["originalHashes"].items():
            if name not in ("projects", "payments", "allocations", "metadata"):
                raise ValueError("Unexpected original type")
            if hashlib.sha256((folder / (name + ".original")).read_bytes()).hexdigest() != checksum:
                raise ValueError("Original export checksum mismatch")
        expected = hashlib.sha256(
            json.dumps(
                dict(hashes=edition["originalHashes"], parserVersion=edition["parserVersion"]),
                sort_keys=True,
            ).encode()
        ).hexdigest()
        if expected != edition["importId"]:
            raise ValueError("Preserved export identity mismatch")
        if any(
            r.get("approved") or r.get("publicationReady") or r.get("settlementVerified")
            for r in edition["records"]
        ):
            raise ValueError("Private import unexpectedly contains approval")
        for record in edition["records"]:
            expected_record = hashlib.sha256(
                json.dumps(tuple(record["sourceIdentity"])).encode()
            ).hexdigest()
            if record["canonicalId"] != expected_record:
                raise ValueError("Source payment canonical identity mismatch")
        blocked = set()
        for table in ("payments", "allocations"):
            lines = {q["line"] for q in edition.get("quarantine", []) if q["table"] == table}
            rows = csv.DictReader(
                io.StringIO((folder / (table + ".original")).read_bytes().decode("utf-8-sig"))
            )
            for line, row in enumerate(rows, 2):
                if line in lines and row.get("source_system") and row.get("source_payment_id"):
                    blocked.add(
                        (
                            row["source_system"].strip(),
                            row["source_payment_id"].strip(),
                            (row.get("component_id") or "").strip(),
                        )
                    )
        edition["blockedSourceIdentities"] = sorted(blocked)
        editions.append(edition)
    return editions


def main():
    base = ROOT / "data/acquisition/department-exports"
    result = reconcile(load_editions(base))
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = base / "catalogue.json"
    raw = (json.dumps(result, indent=2) + "\n").encode()
    target.write_bytes(raw)
    target.chmod(0o600)
    digest = base / "catalogue.sha256"
    digest.write_text(hashlib.sha256(raw).hexdigest() + "\n")
    digest.chmod(0o600)
    print(
        json.dumps(
            {
                k: result[k]
                for k in ("imports", "uniquePayments", "conflictingPayments", "approvedPayments")
            }
        )
    )


if __name__ == "__main__":
    main()
