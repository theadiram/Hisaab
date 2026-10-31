"""Interpret acquired annual PDF columns without classifying programmes or publishing totals.
2016 uses Plan/Non-Plan/Total; later editions use Revenue/Capital/Total. These are not interchangeable.
"""

import hashlib, json, re
from decimal import Decimal
from pathlib import Path
from pypdf import PdfReader
from ingest import ROOT, DATA, ACQUISITION, atomic_json

VERSION = "annual-budget-columns-v2"
CELL = r"(?:-?\d[\d,]*\.\d+|\.{3})"


def parse_cells(line, periods, components):
    m = re.search(r"(" + CELL + r"(?:\s+" + CELL + r"){11})\s*$", line)
    if not m:
        return None
    prefix = line[: m.start()].strip()
    if prefix and re.fullmatch(CELL, prefix.split()[-1]):
        return None
    tokens = m[1].split()
    values = [None if t == "..." else Decimal(t.replace(",", "")) for t in tokens]
    if any(
        v is not None
        and (not v.is_finite() or v * 10000000 != (v * 10000000).quantize(Decimal(".01")))
        for v in values
    ):
        raise ValueError("Source amount not exact to paise")
    columns = []
    for i, (measure, year) in enumerate(periods):
        group = values[i * 3 : i * 3 + 3]
        if all(v is not None for v in group) and group[0] + group[1] != group[2]:
            raise ValueError("Source components do not reconcile")
        columns.append(
            {
                "measure": measure,
                "financialYear": year,
                "components": {
                    components[j]: None if v is None else format(v, "f")
                    for j, v in enumerate(group)
                },
                "totalRupees": None if group[2] is None else format(group[2] * 10000000, ".2f"),
                "sourceTokens": tokens[i * 3 : i * 3 + 3],
            }
        )
    return {
        "labelFragment": line[: m.start()].strip(),
        "sourceUnit": "crore",
        "columns": columns,
        "missingNotation": "Ellipsis remains unknown. No source zero inferred.",
        "reconciliation": "Components checked where all cells specified; programme hierarchy review pending.",
    }


def run():
    for path in sorted((ACQUISITION / "funding-inventory").glob("*.json")):
        inv = json.loads(path.read_text())
        reader = PdfReader(ROOT / inv["source"]["original"])
        records = []
        quarantine = []
        periods = []
        components = []
        for p, page in enumerate(reader.pages, 1):
            text = page.extract_text()
            pairs = re.findall(r"\b(Actual|Budget|Revised)\s+(20\d{2}-20\d{2})\b", text)
            if len(pairs) == 4 and [x[0] for x in pairs] == [
                "Actual",
                "Budget",
                "Revised",
                "Budget",
            ]:
                if "Plan Non-Plan Total" in text:
                    components = ["plan", "non_plan", "total"]
                elif "Revenue Capital Total" in text:
                    components = ["revenue", "capital", "total"]
                else:
                    components = []
                if re.search(r"(?i)in.*crores", text):
                    periods = [
                        (
                            {
                                "Actual": "actual",
                                "Budget": "budget_estimate",
                                "Revised": "revised_estimate",
                            }[m],
                            y,
                        )
                        for m, y in pairs
                    ]
                else:
                    periods = []
            if not periods or not components:
                continue
            for line_no, line in enumerate(text.splitlines(), 1):
                identity = f"{inv['source']['sha256']}:{p}:{line_no}"
                try:
                    interpretation = parse_cells(line, periods, components)
                    if interpretation:
                        records.append(
                            {
                                "rowId": identity,
                                "parserVersion": VERSION,
                                "edition": inv["edition"],
                                "interpretation": interpretation,
                            }
                        )
                except ValueError as e:
                    quarantine.append({"rowId": identity, "reason": str(e)})
        ids = {r["id"] for r in inv["rows"]}
        records = [r for r in records if r["rowId"] in ids]
        out = {
            "edition": inv["edition"],
            "sourceHash": inv["source"]["sha256"],
            "parserVersion": VERSION,
            "records": records,
            "quarantine": quarantine,
            "publication": False,
        }
        atomic_json(ACQUISITION / "funding-interpretations" / path.name, out)
        print(
            json.dumps(
                {
                    "edition": inv["edition"],
                    "interpretedRows": len(records),
                    "quarantinedRows": len(quarantine),
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    run()
