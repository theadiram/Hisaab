#!/usr/bin/env python3
"""Preserve versioned GeoSadak mirror geography; never infer spending from an asset."""

import argparse, concurrent.futures, hashlib, json, urllib.request, zipfile, io
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
REPO = "datameet/pmgsy-geosadak"
LAYERS = {"Facilities", "Proposals"}


def acquire():
    commit = json.load(
        urllib.request.urlopen(f"https://api.github.com/repos/{REPO}/commits/master", timeout=30)
    )["sha"]
    tree = json.load(
        urllib.request.urlopen(
            f"https://api.github.com/repos/{REPO}/git/trees/{commit}?recursive=1", timeout=30
        )
    )
    if tree.get("truncated"):
        raise ValueError("Incomplete repository inventory")
    files = [
        r
        for r in tree["tree"]
        if r["type"] == "blob"
        and (r["path"].split("/")[1] if r["path"].startswith("data/") else "") in LAYERS
    ]
    original_dir = ROOT / "data/originals/geosadak-mirror"
    original_dir.mkdir(parents=True, exist_ok=True)

    def fetch(row):
        try:
            url = f"https://raw.githubusercontent.com/{REPO}/{commit}/{row['path']}"
            with urllib.request.urlopen(url, timeout=30) as response:
                raw = response.read(50_000_001)
            if len(raw) > 50_000_000 or len(raw) != row["size"]:
                raise ValueError("Archive size mismatch")
            if (
                hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
                != row["sha"]
            ):
                raise ValueError("Repository blob checksum mismatch")
            with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                if sum(i.file_size for i in archive.infolist()) > 500_000_000:
                    raise ValueError("Expanded archive exceeds limit")
                if any(i.flag_bits & 1 for i in archive.infolist()):
                    raise ValueError("Encrypted archive")
                if archive.testzip():
                    raise ValueError("Archive CRC mismatch")
            digest = hashlib.sha256(raw).hexdigest()
            target = original_dir / digest
            if target.exists() and target.read_bytes() != raw:
                raise ValueError("Original collision")
            target.write_bytes(raw)
            return {
                "path": row["path"],
                "layer": row["path"].split("/")[1],
                "stateFile": Path(row["path"]).stem,
                "url": url,
                "sha256": digest,
                "gitBlob": row["sha"],
                "bytes": len(raw),
                "original": str(target.relative_to(ROOT)),
                "status": "preserved",
                "sourceEdition": "2022 archived mirror",
                "retrievedAt": datetime.now(timezone.utc).isoformat(),
                "custodian": "Ministry of Rural Development / NRIDA",
                "delivery": "DataMeet mirror; not a live government download",
            }
        except Exception as e:
            return {"path": row["path"], "status": "failed", "error": str(e)}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(fetch, files))
    private = ROOT / "data/acquisition/geography"
    private.mkdir(parents=True, exist_ok=True)
    manifest = {
        "repository": REPO,
        "commit": commit,
        "authoritativeRelease": "https://www.pib.gov.in/PressReleasePage.aspx?PRID=1800373",
        "license": "Government Open Data License India; attribution required",
        "edition": "2022 archived mirror",
        "files": results,
    }
    (private / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(
        json.dumps(
            {
                "preserved": sum(r["status"] == "preserved" for r in results),
                "failed": sum(r["status"] == "failed" for r in results),
                "bytes": sum(r.get("bytes", 0) for r in results),
                "commit": commit,
                "failedFiles": [r for r in results if r["status"] == "failed"],
            }
        )
    )


def inspect():
    import shapefile

    manifest = json.loads((ROOT / "data/acquisition/geography/manifest.json").read_text())
    for row in manifest["files"]:
        if row["status"] != "preserved":
            continue
        with zipfile.ZipFile(ROOT / row["original"]) as z:
            names = z.namelist()
            shp = next(n for n in names if n.lower().endswith(".shp"))
            base = shp[:-4]
            find = lambda ext: next(n for n in names if n.lower() == (base + ext).lower())
            reader = shapefile.Reader(
                shp=io.BytesIO(z.read(shp)),
                dbf=io.BytesIO(z.read(find(".dbf"))),
                shx=io.BytesIO(z.read(find(".shx"))),
                encoding="utf-8",
                encodingErrors="replace",
            )
            sample = next(reader.iterShapeRecords(), None)
            print(
                json.dumps(
                    {
                        "file": row["path"],
                        "rows": len(reader),
                        "fields": reader.fields[1:],
                        "prj": z.read(find(".prj")).decode()
                        if any(n.lower().endswith(".prj") for n in names)
                        else None,
                        "sample": sample.record.as_dict() if sample else None,
                        "geometry": sample.shape.__geo_interface__ if sample else None,
                    },
                    ensure_ascii=False,
                )
            )
            if row["stateFile"] == "AndhraPradesh" and row["layer"] == "Facilities":
                break


def normalize():
    import shapefile, sqlite3, math, re, collections

    manifest = json.loads((ROOT / "data/acquisition/geography/manifest.json").read_text())
    target = ROOT / "data/acquisition/geography/assets.sqlite"
    temp = target.with_suffix(".sqlite.tmp")
    if temp.exists():
        temp.unlink()
    db = sqlite3.connect(temp)
    db.executescript(
        """create table sources(hash text primary key,metadata text not null);create table assets(row_id integer primary key,id text unique not null,kind text not null,title text not null,category text not null,state text not null,state_id integer,district_id integer,block_id integer,source_identity text not null,lng real not null,lat real not null,source_hash text not null,source_row integer not null,geometry text not null,source_fields text not null,text_review integer not null);create virtual table asset_bounds using rtree(row_id,min_lng,max_lng,min_lat,max_lat);"""
    )
    counts = collections.Counter()
    quarantine = []
    file_counts = []
    for source in manifest["files"]:
        if source["status"] != "preserved":
            continue
        raw = (ROOT / source["original"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != source["sha256"]:
            raise ValueError("Original checksum changed")
        db.execute("insert into sources values(?,?)", (source["sha256"], json.dumps(source)))
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = z.namelist()
            shp = next(n for n in names if n.lower().endswith(".shp"))
            base = shp[:-4]
            find = lambda ext: next(n for n in names if n.lower() == (base + ext).lower())
            prj = z.read(find(".prj")).decode("ascii")
            if not prj.startswith("GEOGCS[") or "WGS_1984" not in prj or "Degree" not in prj:
                raise ValueError("Source CRS requires explicit transformation")
            reader = shapefile.Reader(
                shp=io.BytesIO(z.read(shp)),
                dbf=io.BytesIO(z.read(find(".dbf"))),
                shx=io.BytesIO(z.read(find(".shx"))),
                encoding="utf-8",
                encodingErrors="replace",
            )
            accepted = 0
            for number, sr in enumerate(reader.iterShapeRecords(), 1):
                try:
                    row = sr.record.as_dict()
                    geometry = sr.shape.__geo_interface__
                    points = sr.shape.points
                    if not points or any(
                        len(p) < 2
                        or not all(math.isfinite(v) for v in p[:2])
                        or not 68 <= p[0] <= 98
                        or not 5 <= p[1] <= 38
                        for p in points
                    ):
                        raise ValueError("Invalid or out-of-region source geometry")
                    if source["layer"] == "Facilities":
                        if geometry["type"] != "Point":
                            raise ValueError("Facility must have a source point")
                        identity = row["FACILITY_I"]
                        title = row.get("FAC_DESC") or "Unnamed facility"
                        category = row.get("FAC_CATEGO") or "Unspecified"
                        kind = {
                            "Education": "education",
                            "Medical": "health",
                            "Transport/Admin": "public",
                            "Agro": "agriculture",
                        }.get(category, "other")
                    else:
                        if geometry["type"] not in ("LineString", "MultiLineString"):
                            raise ValueError("Road proposal must have line geometry")
                        identity = row["MRL_ID"]
                        title = row.get("WORK_NAME") or "Unnamed road proposal"
                        category = "Road proposal"
                        kind = "road"
                    if (
                        not isinstance(identity, (int, float))
                        or identity <= 0
                        or int(identity) != identity
                    ):
                        raise ValueError("Invalid original asset identifier")
                    text_review = int("\ufffd" in title or "\ufffd" in category)
                    if text_review:
                        title = (
                            f"Facility {int(identity)} — source name needs encoding review"
                            if kind != "road"
                            else f"Road proposal {int(identity)} — source name needs encoding review"
                        )
                    point = list(points[len(points) // 2][:2])
                    asset_id = f"{source['sha256'][:20]}:{number}"
                    fields = {
                        k: v
                        for k, v in row.items()
                        if isinstance(v, (str, int, float)) or v is None
                    }
                    state = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", source["stateFile"])
                    values = (
                        asset_id,
                        kind,
                        title,
                        category,
                        state,
                        row.get("STATE_ID"),
                        row.get("DISTRICT_I"),
                        row.get("BLOCK_ID"),
                        str(int(identity)),
                        point[0],
                        point[1],
                        source["sha256"],
                        number,
                        json.dumps(geometry) if kind == "road" else "",
                        json.dumps(fields)
                        if kind == "road"
                        else json.dumps({"HAB_ID": fields.get("HAB_ID")}),
                        text_review,
                    )
                    cursor = db.execute(
                        "insert into assets(id,kind,title,category,state,state_id,district_id,block_id,source_identity,lng,lat,source_hash,source_row,geometry,source_fields,text_review) values("
                        + ",".join("?" for _ in values)
                        + ")",
                        values,
                    )
                    db.execute(
                        "insert into asset_bounds values(?,?,?,?,?)",
                        (
                            cursor.lastrowid,
                            min(p[0] for p in points),
                            max(p[0] for p in points),
                            min(p[1] for p in points),
                            max(p[1] for p in points),
                        ),
                    )
                    counts[kind] += 1
                    counts["textEncodingReview"] += text_review
                    accepted += 1
                except (ValueError, KeyError, TypeError, AttributeError) as e:
                    quarantine.append({"file": source["path"], "row": number, "reason": str(e)})
            file_counts.append(
                {"path": source["path"], "sourceRows": len(reader), "accepted": accepted}
            )
        db.commit()
        print(
            json.dumps(
                {"state": source["stateFile"], "layer": source["layer"], "accepted": accepted}
            ),
            flush=True,
        )
    db.execute("create index asset_kind on assets(kind)")
    db.execute("create index asset_identity on assets(state_id,district_id,source_identity)")
    db.commit()
    db.close()
    temp.replace(target)
    report = {
        "edition": manifest["edition"],
        "mirrorCommit": manifest["commit"],
        "originalArchives": len(manifest["files"]),
        "stateFiles": len(
            set(r["stateFile"] for r in manifest["files"] if r["status"] == "preserved")
        ),
        "assetRows": sum(v for k, v in counts.items() if k != "textEncodingReview"),
        "byKind": {k: v for k, v in counts.items() if k != "textEncodingReview"},
        "textEncodingReview": counts["textEncodingReview"],
        "quarantinedRows": len(quarantine),
        "files": file_counts,
        "spendingLinked": 0,
        "publication": "asset_geography_only_not_payment_evidence",
        "deployment": "local_geography_store; hosted distribution pending",
        "sourceRelease": manifest["authoritativeRelease"],
        "license": manifest["license"],
        "photosAvailable": 0,
        "buildingFootprintsAvailable": 0,
    }
    (ROOT / "data/geosadak-acquisition.json").write_text(json.dumps(report, indent=2) + "\n")
    (ROOT / "data/acquisition/geography/quarantine.json").write_text(
        json.dumps(quarantine, indent=2) + "\n"
    )
    print(json.dumps(report), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["acquire", "inspect", "normalize"])
    args = parser.parse_args()
    globals()[args.mode]()
