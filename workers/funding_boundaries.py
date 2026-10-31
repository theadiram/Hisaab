"""Prepare a separately licensed state geometry layer; never substitute map shapes for spending evidence."""

import json, hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ISO = {
    "AN": "35",
    "AP": "28",
    "AR": "12",
    "AS": "18",
    "BR": "10",
    "CH": "4",
    "CT": "22",
    "DH": "38",
    "DL": "7",
    "GA": "30",
    "GJ": "24",
    "HR": "6",
    "HP": "2",
    "JK": "1",
    "JH": "20",
    "KA": "29",
    "KL": "32",
    "LA": "37",
    "LD": "31",
    "MP": "23",
    "MH": "27",
    "MN": "14",
    "ML": "17",
    "MZ": "15",
    "NL": "13",
    "OR": "21",
    "PY": "34",
    "PB": "3",
    "RJ": "8",
    "SK": "11",
    "TN": "33",
    "TG": "36",
    "TR": "16",
    "UP": "9",
    "UT": "5",
    "WB": "19",
}


def run():
    meta = json.loads((ROOT / "tmp/funding/geoboundaries.json").read_text())
    raw = (ROOT / "tmp/funding/gb-states.geojson").read_bytes()
    geo = json.loads(raw)
    if (
        meta["boundaryLicense"] != "Creative Commons Attribution 2.5 India (CC BY 2.5 IN)"
        or meta["admUnitCount"] != "36"
    ):
        raise ValueError("Geometry licence or coverage changed")
    seen = set()
    for feature in geo["features"]:
        old = feature["properties"]
        code = ISO[old["shapeISO"][3:]]
        if code in seen:
            raise ValueError("Duplicate state code")
        seen.add(code)
        feature["properties"] = {
            "code": code,
            "name": old["shapeName"],
            "sourceShapeId": old["shapeID"],
            "iso": old["shapeISO"],
        }
        feature["id"] = int(code)
        if feature["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
            raise ValueError("Polygon required")
    if seen != set(ISO.values()):
        raise ValueError("All 36 current jurisdictions required")
    digest = hashlib.sha256(raw).hexdigest()
    p = ROOT / "data/originals/funding-boundaries" / digest
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(raw)
    geo["name"] = "Hisaab state selection geometry"
    geo["attribution"] = (
        "geoBoundaries / DataMeet India community / Election Commission of India; CC BY 2.5 IN"
    )
    geo["license"] = "https://creativecommons.org/licenses/by/2.5/in/"
    geo["source"] = meta["simplifiedGeometryGeoJSON"]
    output = json.dumps(geo, separators=(",", ":")).encode()
    dest = ROOT / "public/geography/funding-states.geojson"
    dest.write_bytes(output)
    provenance = {
        "status": "licensed_community_geometry_available_soi_review_pending",
        "source": meta["simplifiedGeometryGeoJSON"],
        "metadataSource": "https://www.geoboundaries.org/api/current/gbOpen/IND/ADM1/",
        "license": geo["license"],
        "attribution": geo["attribution"],
        "sourceHash": digest,
        "displayHash": hashlib.sha256(output).hexdigest(),
        "buildDate": meta["buildDate"],
        "representedYear": meta["boundaryYearRepresented"],
        "jurisdictions": 36,
        "historicalCorrespondence": "Current LGD codes via explicit ISO mapping. Historical combined figures are retained separately and not split onto modern polygons.",
        "limitations": "Community source, not an authoritative Survey of India edition. Metadata reports year 2011 although the geometry includes modern Ladakh and merged DNHDD. No state centre or project location is invented. Survey of India ABDB remains under acquisition and permission assessment.",
    }
    (ROOT / "data/funding-boundaries.json").write_text(json.dumps(provenance, indent=2) + "\n")
    (ROOT / "public/geography/funding-states-license.json").write_text(
        json.dumps(provenance, indent=2) + "\n"
    )
    ledger = ROOT / "data/funding-acquisition.json"
    data = json.loads(ledger.read_text())
    data["boundary"] = provenance
    ledger.write_text(json.dumps(data, indent=2) + "\n")
    print(
        json.dumps(
            {
                "features": 36,
                "geometryHash": provenance["displayHash"],
                "sourceLicence": "CC BY 2.5 IN",
            }
        )
    )


if __name__ == "__main__":
    run()
