"""Prepare 200 narrow PRIVATE road records, checking exact preserved originals.
No network, source approval, owner session, staging or publication is performed.
"""

import hashlib, json, re, struct, zipfile
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone, timedelta
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "data/acquisition/first-dots"
OUT = BASE / "two-hundred"


def load(p):
    return json.loads((ROOT / p).read_text())


def save(p, v):
    p.write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")) + "\n")


@lru_cache(None)
def checked_file(p, h):
    b = (ROOT / p).read_bytes()
    assert hashlib.sha256(b).hexdigest() == h
    return b


@lru_cache(None)
def original_rows(p, h):
    return json.loads(checked_file(p, h))


@lru_cache(None)
def archive(p, h):
    import io

    with zipfile.ZipFile(io.BytesIO(checked_file(p, h))) as z:
        result = tuple(
            z.read(next(n for n in z.namelist() if n.lower().endswith(e)))
            for e in [".dbf", ".shx", ".shp", ".prj"]
        )
    assert "WGS_1984" in result[3].decode("ascii") and "Degree" in result[3].decode("ascii")
    return result[:3]


def feature(p, h, n):
    dbf, shx, shp = archive(p, h)
    count, hl, rl = struct.unpack_from("<IHH", dbf, 4)
    assert 1 <= n <= count
    rec = dbf[hl + (n - 1) * rl : hl + n * rl]
    assert rec[0] == 32
    fields = {}
    offset = 1
    for i in range(32, hl - 1, 32):
        if dbf[i] == 13:
            break
        desc = dbf[i : i + 32]
        name = desc[:11].split(b"\0")[0].decode("ascii")
        length = desc[16]
        fields[name] = rec[offset : offset + length].decode("utf-8").strip()
        offset += length
    pos, words = struct.unpack_from(">II", shx, 100 + (n - 1) * 8)
    num, actual = struct.unpack_from(">II", shp, pos * 2)
    assert num == n and words == actual
    data = shp[pos * 2 + 8 : pos * 2 + 8 + words * 2]
    assert struct.unpack_from("<I", data)[0] == 3
    pc, npoints = struct.unpack_from("<II", data, 36)
    offsets = list(struct.unpack_from("<" + "I" * pc, data, 44)) + [npoints]
    points = [list(struct.unpack_from("<dd", data, 44 + 4 * pc + i * 16)) for i in range(npoints)]
    return fields, [points[offsets[i] : offsets[i + 1]] for i in range(pc)], points


def source_date(v):
    m = re.fullmatch(r"/Date\((-?\d+)\)/", v or "")
    assert m
    return (
        datetime.fromtimestamp(int(m[1]) / 1000, timezone(timedelta(hours=5, minutes=30)))
        .date()
        .isoformat()
    )


def main():
    OUT.mkdir(exist_ok=True)
    cs = {
        c["id"]: c
        for p in (ROOT / "data/acquisition/candidates").glob("*.json")
        for d in [json.loads(p.read_text())]
        if d.get("sourceId") == "pmgsy-dashboard"
        for c in d["candidates"]
    }
    ps = {
        p["candidateId"]: p
        for f in [
            "data/acquisition/geography-proposals.json",
            "data/acquisition/first-dots/district-recovery.json",
        ]
        for p in load(f)["proposals"]
    }
    areas = {a["id"]: a for a in load("data/acquisition/districts.json")["areas"]}
    fresh = {
        r["state"]: r
        for r in load("data/acquisition/first-dots/roads-district-original-recovery.json")[
            "requests"
        ]
        if r["status"] == "preserved"
    }
    geos = {s["sha256"]: s for s in load("data/acquisition/geography/manifest.json")["files"]}
    seeds = {
        c["id"]
        for c in load("data/acquisition/first-dots/roads-work-candidates.json")["candidates"]
    }
    pool = defaultdict(list)
    for line in (ROOT / "data/acquisition/geography/road-matches.jsonl").open():
        m = json.loads(line)
        c = cs[m["candidateId"]]
        raw = c["review"]["raw"]
        state = c["state"]
        if (
            m["geometryFeatures"] != 1
            or c["id"] not in ps
            or not all(c["stages"][i].get("date") for i in [0, 1])
            or not raw.get("TEND_AGREEMENT_NUMBER")
        ):
            continue
        if state in fresh and raw["MAST_DISTRICT_CODE"] != fresh[state]["query"]["DistrictID"]:
            continue
        pool[state].append((c, m))
    for state in pool:
        pool[state].sort(
            key=lambda pair: (pair[0]["id"] not in seeds, pair[0]["district"], pair[0]["id"])
        )
    states = sorted(pool)
    groups = [states[:8], states[8:]]
    selected = []
    used = set()
    batch_indices = []
    for group in groups:
        picked = []
        positions = Counter()
        while len(picked) < 100:
            before = len(picked)
            for state in group:
                while positions[state] < len(pool[state]):
                    item = pool[state][positions[state]]
                    positions[state] += 1
                    if item[1]["officialRoadId"] in used:
                        continue
                    used.add(item[1]["officialRoadId"])
                    picked.append(item)
                    break
                if len(picked) == 100:
                    break
            assert len(picked) > before, "Not enough distinct original road identities"
        batch_indices.append([len(selected), len(selected) + len(picked)])
        selected += picked
    policies = [
        load("data/acquisition/first-dots/roads-originals/" + p)
        for p in [
            "pmgsy-reuse-policy.json",
            "geography-license-release.json",
            "financial-year-definition.json",
        ]
    ]
    for p in policies:
        checked_file(p["file"], p["sha256"])
    records = []
    works = []
    sources = {}
    assets = []
    for c, m in selected:
        w = deepcopy(c)
        raw = c["review"]["raw"]
        primary = c["stages"][0]["receipts"][0]
        oldpath = "data/originals/pmgsy-dashboard/" + m["workDocumentHash"]
        oldrows = original_rows(oldpath, m["workDocumentHash"])
        oldidx = int(re.search(r"JSON row (\d+)", primary["locator"])[1])
        assert oldrows[oldidx - 1] == raw
        source = fresh.get(c["state"])
        if source:
            source = deepcopy(source)
            rows = original_rows(source["file"], source["sha256"])
            matches = [
                i
                for i, r in enumerate(rows, 1)
                if str(r["IMS_PR_ROAD_CODE"]) == str(raw["IMS_PR_ROAD_CODE"]) and r == raw
            ]
            assert len(matches) == 1
            row = matches[0]
            h = source["sha256"]
            sourcefile = source["file"]
            retrieved = source["retrievedAt"]
            url = source["url"]
            query = source["query"]
        else:
            meta = load("data/acquisition/documents/" + m["workDocumentHash"] + ".json")
            h = m["workDocumentHash"]
            row = oldidx
            sourcefile = oldpath
            retrieved = meta["retrievedAt"]
            url = primary["url"]
            query = meta.get("query")
        geo = geos[m["geographyDocumentHash"]]
        fields, parts, points = feature(geo["original"], geo["sha256"], m["sourceRow"])
        assert (
            int(fields["MRL_ID"]),
            int(fields["STATE_ID"]),
            int(fields["DISTRICT_I"]),
            int(fields["IMS_YEAR"]),
            int(fields["IMS_BATCH"]),
            fields["WORK_NAME"].casefold(),
        ) == (
            int(raw["IMS_PR_ROAD_CODE"]),
            raw["MAST_STATE_CODE"],
            raw["MAST_DISTRICT_CODE"],
            raw["IMS_YEAR"],
            raw["IMS_BATCH"],
            raw["IMS_ROAD_NAME"].strip().casefold(),
        )
        assert parts == m["geometry"]["coordinates"]
        assert m["markerOnLine"] in points
        area = areas[ps[c["id"]]["areaId"]]
        assert area["name"].strip().casefold() == c["district"].strip().casefold()
        if c["state"] == "Keralam":
            assert (
                area["state"] == "Kerala"
                and ps[c["id"]]["method"]
                == "documented_state_name_correspondence_unique_exact_district_name"
            )
        else:
            assert area["state"].strip().casefold() == c["state"].strip().casefold()
        dates = [source_date(raw[k]) for k in ["IMS_SANCTIONED_DATE", "TEND_DATE_OF_AGREEMENT"]]
        assert dates == [c["stages"][i]["date"] for i in [0, 1]]
        sd = datetime.strptime(dates[0], "%Y-%m-%d").date()
        fy = sd.year if sd.month >= 4 else sd.year - 1
        w.update(
            areaId=area["id"],
            state=area["state"],
            financialYear=f"{fy}-{fy + 1}",
            location=m["markerOnLine"],
            locationPrecision="source_point",
            money=[],
            physicalVerification="Actual site not independently verified. Point is an exact original vertex on an archived 2022 proposal route.",
        )
        w.pop("review", None)
        w["summary"] = (
            "Official OMMAS road record linked to archived GeoSadak 2022 proposal geometry via DataMeet (Government Open Data License India). Source: NRIDA, Ministry of Rural Development. Current condition, payment, spending and completion are not established. Financial year contains the source-reported sanction date only. No government endorsement."
        )
        narrow = {
            k: raw[k]
            for k in [
                "IMS_PR_ROAD_CODE",
                "IMS_PACKAGE_ID",
                "IMS_ROAD_NAME",
                "MAST_STATE_NAME",
                "MAST_DISTRICT_NAME",
                "IMS_SANCTIONED_DATE",
                "TEND_AGREEMENT_NUMBER",
                "TEND_DATE_OF_AGREEMENT",
            ]
        }
        receipt = {
            **primary,
            "documentHash": h,
            "url": url,
            "retrievedAt": retrieved[:10],
            "locator": f"JSON row {row}; IMS_PR_ROAD_CODE {raw['IMS_PR_ROAD_CODE']}; StateID {raw['MAST_STATE_CODE']}; DistrictID {raw['MAST_DISTRICT_CODE']}",
            "rawText": json.dumps(narrow, separators=(",", ":")),
            "permission": "Attributed official text/data; preserved OMMAS reuse policy. Document-specific owner decision pending.",
        }
        gr = {
            "id": f"{geo['sha256'][:12]}:road:{raw['IMS_PR_ROAD_CODE']}",
            "title": "Coordinate provenance only: archived GeoSadak 2022 proposal route via DataMeet",
            "url": geo["url"],
            "documentHash": geo["sha256"],
            "locator": f"{geo['path']}; DBF/SHP feature row {m['sourceRow']}; MRL_ID {raw['IMS_PR_ROAD_CODE']}",
            "retrievedAt": geo["retrievedAt"][:10],
            "rawText": json.dumps(
                {
                    "edition": "2022",
                    "marker": w["location"],
                    "sourceRoadId": raw["IMS_PR_ROAD_CODE"],
                    "actualSiteVerified": False,
                },
                separators=(",", ":"),
            ),
            "permission": "Government Open Data License India archived GIS; preserve NRIDA/MoRD and DataMeet attribution. Owner decision pending.",
        }
        for i, stage in enumerate(w["stages"]):
            stage["amount"] = None
            stage["reviewStatus"] = "pending"
            if i < 2:
                stage["receipts"] = [deepcopy(receipt)]
                stage["label"] = (
                    "Sanction date reported" if i == 0 else "Agreement reference reported"
                )
                stage["description"] = (
                    "Official report supplies this date/reference. No original signed order, amount, contractor or payment is claimed."
                )
            if i == 0:
                stage["receipts"].append(gr)
                stage["description"] += (
                    " Separate GIS receipt supports archived proposal-coordinate provenance only."
                )
        for hh, meta, name, ctype, basis in [
            (
                h,
                {"url": url, "retrievedAt": retrieved, "file": sourcefile},
                "Official PMGSY road/tender report",
                "application/json",
                "Accurate attributed official OMMAS text/data; no logo/photo or government endorsement. Source policy preserved for explicit owner review.",
            ),
            (
                geo["sha256"],
                geo,
                "Archived GeoSadak 2022 proposal GIS via DataMeet",
                "application/zip",
                "Government Open Data License India; official GeoSadak release names DataMeet. Preserve NRIDA/MoRD and DataMeet attribution, archive edition and source-point limitation. Owner decision pending.",
            ),
        ]:
            sid = "firstdot-" + hh[:20]
            sources[hh] = {
                "id": sid,
                "name": name,
                "family": "public_road_evidence",
                "hash": hh,
                "url": meta["url"],
                "storagePath": sid + "/" + hh,
                "contentType": ctype,
                "retrievedAt": meta["retrievedAt"],
                "reuseBasis": basis,
            }
        refs = [
            {"hash": r["documentHash"], "url": r["url"], "locator": r["locator"]}
            for r in [receipt, gr]
        ]
        assets.append(
            {
                "id": "asset-" + w["id"],
                "projectId": w["id"],
                "assetId": m["geographyAssetId"],
                "matchBasis": "official_id",
                "location": w["location"],
                "precision": "source_point",
                "geometry": None,
                "sourceRefs": refs,
            }
        )
        works.append(w)
        records.append(
            {
                "candidateId": w["id"],
                "officialRoadId": str(raw["IMS_PR_ROAD_CODE"]),
                "state": w["state"],
                "district": w["district"],
                "areaId": w["areaId"],
                "source": {
                    "file": sourcefile,
                    "sha256": h,
                    "row": row,
                    "query": query,
                    "originalRowExactlyMatched": True,
                    "priorOriginal": oldpath,
                    "priorOriginalRow": oldidx,
                    "sameAllOriginalFields": True,
                },
                "geography": {
                    "file": geo["original"],
                    "sha256": geo["sha256"],
                    "featureRow": m["sourceRow"],
                    "sixSourceFieldsExactlyMatched": True,
                    "fullRouteCoordinatesExactlyMatched": True,
                    "markerExactlyOriginalVertex": True,
                    "currentSiteVerified": False,
                },
                "district": {
                    "basis": ps[c["id"]]["method"],
                    "registry": "2026-10-06",
                    "currentBoundaryMembershipVerified": False,
                },
                "sanctionDate": dates[0],
                "agreementDate": dates[1],
                "financialYear": w["financialYear"],
                "financialYearBasis": "Dated sanction event with official DEA April–March definition; IMS_YEAR not interpreted.",
                "publicationApproved": False,
            }
        )
    for bi, (start, end) in enumerate(batch_indices, 1):
        ww = works[start:end]
        hh = {r["documentHash"] for w in ww for s in w["stages"] for r in s["receipts"]}
        package = {
            "version": "hisaab-intake/1",
            "batchId": f"firstdot-road-preview-200-part-{bi}-20261025",
            "jurisdiction": "national",
            "cutoff": "2026-10-25",
            "sources": [sources[h] for h in sorted(hh)],
            "projects": ww,
            "assets": assets[start:end],
            "contracts": [],
            "payments": [],
            "allocations": [],
            "parties": [],
            "completion": [],
            "funding": [],
            "coverage": {
                "denominator": None,
                "denominatorSource": None,
                "years": sorted({w["financialYear"] for w in ww}),
                "missing": [
                    "Source-level reuse and individual documentary facts require explicit owner decisions.",
                    "Archived 2022 proposal points do not establish current sites or district boundary membership.",
                    "Payment, spending, recipient and completion evidence is not established.",
                ],
                "nextAction": "Use protected owner review and explicit pending reconciliation for existing candidate IDs. No automatic approvals or publication.",
                "checkpoint": "200 exact documentary/geographic checks performed locally; no remote writes or staging.",
            },
        }
        save(OUT / f"intake-part-{bi}.json", package)
    save(
        OUT / "claim-checks.json",
        {
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "records": records,
            "policyOriginals": policies,
            "publicationApproved": False,
        },
    )
    save(OUT / "works.json", {"works": works, "publicationApproved": False})
    summary = {
        "preparedAt": datetime.now(timezone.utc).isoformat(),
        "records": len(works),
        "distinctOfficialRoadIds": len(used),
        "states": dict(Counter(w["state"] for w in works)),
        "districts": len({w["areaId"] for w in works}),
        "eligiblePool": {s: len(v) for s, v in pool.items()},
        "originalChecksums": len(checked_file.cache_info().__str__()),
        "batches": [
            {
                "file": str((OUT / f"intake-part-{i}.json").relative_to(ROOT)),
                "bytes": (OUT / f"intake-part-{i}.json").stat().st_size,
            }
            for i in [1, 2]
        ],
        "ownerApprovals": 0,
        "published": 0,
        "scope": "Source-backed archived proposal-coordinate records only, private and pending explicit owner decisions.",
    }
    summary["originalChecksums"] = checked_file.cache_info().currsize
    save(OUT / "summary.json", summary)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
