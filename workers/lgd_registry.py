"""Read an official LGD district XLSX; preserve source identity and row locators."""

import argparse, hashlib, json, unicodedata
from collections import Counter
from decimal import Decimal
from pathlib import Path
from ingest import ROOT, DATA, ACQUISITION, atomic_json, now

HEADERS = (
    "S.No.",
    "State Code",
    "State Name (In English)",
    "District Code",
    "District Name(In English)",
    "Census 2001 Code",
    "Census 2011 Code",
)


def code(value):
    n = Decimal(str(value))
    if not n.is_finite() or n <= 0 or n != n.to_integral_value():
        raise ValueError("Invalid LGD identity code")
    return str(int(n))


def extract(rows):
    if (
        tuple(rows[0]) != ("All Districts of India", None, None, None, None, None, None)
        or tuple(rows[1]) != HEADERS
    ):
        raise ValueError("LGD export schema changed")
    states = {}
    districts = []
    seen = set()
    for number, row in enumerate(rows[2:], 3):
        if all(v is None for v in row):
            continue
        if len(row) != 7:
            raise ValueError("Unexpected LGD column count")
        _, state_id, state_name, district_id, name, _, _ = row
        state_id = code(state_id)
        district_id = code(district_id)
        if (
            not isinstance(name, str)
            or not name.strip()
            or not isinstance(state_name, str)
            or not state_name.strip()
        ):
            raise ValueError("Incomplete LGD identity")
        if district_id in seen:
            raise ValueError("Duplicate LGD district code")
        if state_id in states and states[state_id]["name"] != state_name.strip():
            raise ValueError("Conflicting LGD state identity")
        seen.add(district_id)
        states[state_id] = {
            "id": "state:" + state_id,
            "code": state_id,
            "kind": "state",
            "name": state_name.strip(),
            "parent_id": None,
        }
        districts.append(
            {
                "id": "district:" + district_id,
                "code": district_id,
                "kind": "district",
                "name": name.strip(),
                "parent_id": "state:" + state_id,
                "state": state_name.strip(),
                "row": number,
            }
        )
    return list(states.values()), districts


def key(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def match(state, district, index):
    matches = index.get((key(state), key(district)), [])
    return matches[0] if len(matches) == 1 else None


def run(file):
    import openpyxl

    raw = Path(file).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    book = openpyxl.load_workbook(file, read_only=True, data_only=False)
    if book.sheetnames != ["allDistrictofIndia"]:
        raise ValueError("Unexpected LGD workbook sheets")
    rows = list(book.active.values)
    if any(isinstance(v, str) and v.startswith("=") for row in rows for v in row):
        raise ValueError("Formula cells require explicit assessment")
    states, districts = extract(rows)
    if len(states) != 36 or len(districts) != 784:
        raise ValueError("Export does not reconcile with assessed official homepage counts")
    original = DATA / "originals" / "lgd" / digest
    original.parent.mkdir(parents=True, exist_ok=True)
    original.write_bytes(raw)
    manifest = {
        "sourceId": "lgd",
        "sourceName": "Local Government Directory",
        "sourceFamily": "administrative_registry",
        "sha256": digest,
        "url": "https://lgdirectory.gov.in/downloadDirectory.do",
        "contextUrl": "https://lgdirectory.gov.in/",
        "permissionStatus": "policy_verified",
        "permission": "Accurate reproduction with prominent source acknowledgment; third-party materials excluded. Official LGD Copyright Policy assessed 2026-10-06.",
        "termsUrl": "https://lgdirectory.gov.in/copyRightPolicy.do",
        "retrievedAt": now(),
        "original": str(original.relative_to(ROOT)),
        "contentType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "parserVersion": "lgd-district-xlsx-v1",
        "query": {
            "entity": "All Districts of India",
            "format": "Xls Report",
            "access": "human_completed_captcha",
        },
        "sheet": "allDistrictofIndia",
        "headerRow": 2,
    }
    atomic_json(ACQUISITION / "documents" / f"{digest}.json", manifest)
    atomic_json(
        ACQUISITION / "districts.json",
        {
            "areas": districts,
            "states": states,
            "sourceHash": digest,
            "importedAt": now(),
            "sourceUrl": manifest["contextUrl"],
        },
    )
    index = {}
    for d in districts:
        index.setdefault((key(d["state"]), key(d["name"])), []).append(d["id"])
    progress = json.loads((DATA / "nationwide-ingestion.json").read_text())
    proposals = []
    unmatched = Counter()
    matched = Counter()
    for partition in progress["statePartitions"]:
        candidates = json.loads(
            (ACQUISITION / "candidates" / f"{partition['sha256']}.json").read_text()
        )["candidates"]
        for c in candidates:
            area = match(c["state"], c["district"], index)
            if area:
                proposals.append(
                    {
                        "candidateId": c["id"],
                        "areaId": area,
                        "method": "unique_exact_state_district_name",
                        "registryHash": digest,
                        "approved": False,
                    }
                )
                matched[area] += 1
            else:
                unmatched[(c["state"], c["district"])] += 1
    atomic_json(
        ACQUISITION / "geography-proposals.json",
        {
            "proposals": proposals,
            "unmatched": [
                {"state": s, "district": d, "candidates": n} for (s, d), n in unmatched.items()
            ],
            "sourceHash": digest,
            "publication": "pending_review",
        },
    )
    status = {
        "districtsExpected": len(districts),
        "statesExpected": len(states),
        "registryDate": "2026-10-06",
        "sourceUrl": manifest["contextUrl"],
        "matchingCandidates": len(proposals),
        "unmatchedCandidates": sum(unmatched.values()),
        "districtsWithCandidateMatches": len(matched),
        "hostedRegistryImported": False,
        "method": "Unique exact state and district names only; historical and renamed districts require review.",
    }
    atomic_json(DATA / "geography-status.json", status)
    print(json.dumps({"sourceHash": digest, **status}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("file")
    run(p.parse_args().file)
