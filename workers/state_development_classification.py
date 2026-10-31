"""Conservative, reviewable development-scope suggestions for private records.

These are rule suggestions, never owner approval or source reuse permission.
Unsplit revenue/department/overview amounts remain unresolved.
"""

import re
from collections import Counter
from state_development_collection import BASE, STATES, write, now
import json

EXCLUDED = {
    "debt_servicing_context",
    "administrative_context",
    "maintenance_context",
    "salary_pension_context",
}


def suggest(row):
    label = row.get("purposeLabel", "")
    lower = label.lower()
    decision = "mixed_unresolved"
    reason = "Detailed development/maintenance split not established"
    if row.get("classification") in EXCLUDED:
        decision = "excluded_context"
        reason = "Explicit extracted debt, establishment, salary/pension or maintenance scope"
    elif re.search(r"\b(?:construction|building construction)\b", lower) and not re.search(
        r"\b(?:maintenance|repairs?|renewal|administration|secretariat)\b", lower
    ):
        decision = "included_candidate"
        reason = "Explicit construction purpose; source identity, rights, overlap and evidence still require review"
    purpose = "other_or_unresolved"
    for name, pattern in [
        ("health", r"health|hospital|medical|dispensar|ayush|anganwadi|nutrition"),
        ("education", r"\bschool|education|scholarship|college|university|hostel"),
        ("transport", r"road|bridge|rail|transport"),
        ("water", r"water|irrigation|dam|sanitation"),
        ("housing", r"housing|awas|pmay"),
        ("agriculture", r"agricultur|farm|crop|seed|horticultur|fish|animal|cattle"),
        ("energy", r"energy|power|electric|discom"),
        ("disaster", r"disaster|flood|relief"),
        ("environment", r"forest|environment|conservation|campa"),
    ]:
        if re.search(pattern, lower):
            purpose = name
            break
    return {
        "id": row["id"] + ":classification",
        "candidateId": row["id"],
        "purposeLabel": label,
        "source": row.get("source"),
        "financialYear": row["financialYear"],
        "decision": decision,
        "suggestedPurpose": purpose,
        "basis": reason,
        "reviewStatus": "awaiting_owner_review",
        "publicationApproved": False,
        "amountMissing": row.get("amountRupees") is None,
        "sourceRightsApproved": False,
        "overlapResolved": False,
    }


def main():
    states = []
    for code, name in STATES:
        file = BASE / code / "candidates.json"
        if not file.exists():
            continue
        data = json.loads(file.read_text())
        rows = [suggest(r) for r in data["budgetCandidates"]]
        report = {
            "version": "state-classification-suggestions/1",
            "checkedAt": now(),
            "stateCode": code,
            "state": name,
            "rows": rows,
            "decisionCounts": dict(Counter(r["decision"] for r in rows)),
            "approved": False,
            "scope": "Suggestions only; no financial totals or publication decisions",
        }
        write(BASE / code / "classification.json", report)
        states.append({k: report[k] for k in ["stateCode", "state", "decisionCounts"]})
    write(
        BASE / "classification-summary.json",
        {"checkedAt": now(), "states": states, "approved": False},
    )
    print(
        json.dumps(
            {
                "states": len(states),
                "suggestions": sum(sum(s["decisionCounts"].values()) for s in states),
            }
        )
    )


if __name__ == "__main__":
    main()
