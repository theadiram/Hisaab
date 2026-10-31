"""Audit whether state project/tender candidates can support a full Hisaab card.

This produces a private evidence-gap report. It never links rows by name or
proximity, derives payment amounts from budget/account totals, or approves
publication.
"""

import json
from collections import Counter

from state_development_collection import BASE, STATES, now, write


REQUIRED_FIELDS = {
    "project_identity": ("sourceProjectId", "title"),
    "exact_geography": ("location",),
    "sanction": ("sanctionAmountRupees", "sanctionDate"),
    "contract": ("contractAmountRupees", "awardDate"),
    "recipient": ("contractorName",),
    "payment": ("paymentAmountRupees", "paymentDate"),
    "completion_evidence": ("completionCertificateSource",),
    "source_locator": ("source.url", "source.locator"),
}


def value_at(row, path):
    value = row
    for key in path.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def audit_project(row):
    missing = [
        field
        for fields in REQUIRED_FIELDS.values()
        for field in fields
        if value_at(row, field) in (None, "", [], {})
    ]
    return {
        "candidateId": row.get("id"),
        "sourceProjectId": row.get("sourceProjectId"),
        "title": row.get("title"),
        "stage": row.get("stage"),
        "missingFields": missing,
        "completeFinancialWorkCard": not missing,
        "reviewStatus": row.get("reviewStatus", "unreviewed"),
        "publicationApproved": False,
        "source": row.get("source"),
        "notes": "Gap audit only. No payment, location, completion, identity match or approval is inferred.",
    }


def audit_state(code, name, projects):
    audited = [audit_project(row) for row in projects]
    fields = Counter(field for row in audited for field in row["missingFields"])
    stages = Counter(str(row.get("stage") or "unknown") for row in audited)
    return {
        "stateCode": code,
        "state": name,
        "candidateProjects": len(audited),
        "completeFinancialWorkCards": sum(row["completeFinancialWorkCard"] for row in audited),
        "fieldCoverage": {
            field: sum(value_at(row, field) not in (None, "", [], {}) for row in projects)
            for fields_in_group in REQUIRED_FIELDS.values()
            for field in fields_in_group
        },
        "missingFieldCounts": dict(fields),
        "stageCounts": dict(stages),
        "projects": audited,
        "publicationApproved": False,
    }


def main():
    states = []
    for code, name in STATES:
        path = BASE / code / "candidates.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text())
        states.append(audit_state(code, name, data.get("projectCandidates", [])))
    all_projects = [project for state in states for project in state["projects"]]
    field_coverage = Counter()
    missing = Counter()
    stages = Counter()
    for state in states:
        field_coverage.update(state["fieldCoverage"])
        missing.update(state["missingFieldCounts"])
        stages.update(state["stageCounts"])
    report = {
        "version": "state-project-card-readiness/1",
        "checkedAt": now(),
        "scope": "Private state-development source candidates only; excludes unrelated asset locations and other Hisaab pilots.",
        "statesChecked": len(states),
        "candidateProjects": len(all_projects),
        "completeFinancialWorkCards": sum(row["completeFinancialWorkCard"] for row in all_projects),
        "fieldCoverage": dict(field_coverage),
        "missingFieldCounts": dict(missing),
        "stageCounts": dict(stages),
        "states": states,
        "publicationApproved": False,
        "rules": [
            "Only explicit fields on the same source candidate count as present.",
            "No name, nearby place, budget total, financial progress or arithmetic match creates a project/payment link.",
            "A tender notice is not an award; an award or contract is not a payment; a reported completion date is not a certificate.",
        ],
    }
    write(BASE / "card-readiness.json", report)
    print(
        json.dumps(
            {
                key: report[key]
                for key in (
                    "statesChecked",
                    "candidateProjects",
                    "completeFinancialWorkCards",
                    "fieldCoverage",
                    "missingFieldCounts",
                    "stageCounts",
                )
            }
        )
    )


if __name__ == "__main__":
    main()
