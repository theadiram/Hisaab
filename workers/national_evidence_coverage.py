"""Public aggregate coverage of collected report partitions, never payment totals."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def partitions(summary):
    result = {}
    for state in summary["states"]:
        name = state["name"]
        if name in result:
            raise ValueError("Duplicate official state partition")
        rows = state.get("rows") if state["status"] == "assessed" else None
        if rows is not None and (type(rows) is not int or rows < 0):
            raise ValueError("Invalid source row count")
        result[name] = dict(status=state["status"], rows=rows)
    return result


def build(lok, rajya):
    houses = [partitions(lok), partitions(rajya)]
    names = sorted(set(houses[0]) | set(houses[1]))
    states = [
        dict(
            name=name,
            lokSabha=houses[0].get(name, dict(status="not assessed", rows=None)),
            rajyaSabha=houses[1].get(name, dict(status="not assessed", rows=None)),
        )
        for name in names
    ]
    completed = sum(
        all(
            s[h]["status"] == "assessed" and s[h]["rows"] is not None
            for h in ["lokSabha", "rajyaSabha"]
        )
        for s in states
    )
    return dict(
        states=states,
        statesAssessed=completed,
        statePartitions=len(states),
        sourceRows=sum(s[h]["rows"] or 0 for s in states for h in ["lokSabha", "rajyaSabha"]),
        scope="MPLADS default Lok Sabha and Rajya Sabha expenditure reports only. Source rows are not unique payments or complete state spending.",
        gaps=[
            "Stable payment references and recorded recipient roles",
            "Gross/net definitions, deductions, reversals and project allocations",
            "Actual project locations, agreements and available completion evidence",
            "Source reuse review and explicit owner publication decisions",
        ],
    )


def current():
    paths = [
        ROOT / "data/mplads-state-collection-assessment.json",
        ROOT / "data/mplads-rajya-state-collection-assessment.json",
    ]
    if not all(p.exists() for p in paths):
        return None
    return build(*(json.loads(p.read_text()) for p in paths))
