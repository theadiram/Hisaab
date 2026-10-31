import sqlite3, json, hashlib, os
from pmtiles.writer import write
from pmtiles.tile import zxy_to_tileid, TileType, Compression

root = "data/acquisition/geography/hosted"
db = sqlite3.connect(root + "/tiles.mbtiles")
manifest = json.load(open(root + "/manifest.json"))
archives = []
for (kind,) in db.execute("select distinct kind from tiles"):
    if kind == "public":
        continue
    name = kind + ".pmtiles"
    with write(root + "/" + name) as w:
        for z, x, y, data, n in db.execute(
            "select z,x,y,data,n from tiles where kind=? order by z,x,y", (kind,)
        ):
            w.write_tile(zxy_to_tileid(z, x, y), data)
        w.finalize(
            {
                "tile_type": TileType.MVT,
                "tile_compression": Compression.GZIP,
                "min_lon_e7": 650000000,
                "min_lat_e7": 50000000,
                "max_lon_e7": 1000000000,
                "max_lat_e7": 390000000,
                "center_zoom": 4,
                "center_lon_e7": 790000000,
                "center_lat_e7": 230000000,
            },
            {
                "name": "Hisaab archived locations: " + kind,
                "format": "pbf",
                "vector_layers": [
                    {
                        "id": "assets",
                        "fields": {
                            "assetId": "String",
                            "kind": "String",
                            "title": "String",
                            "state": "String",
                        },
                        "minzoom": 0,
                        "maxzoom": manifest["maxzoom"],
                    }
                ],
                "record_policy": "Every source point retained; no clustering or thinning",
                "extent": manifest["extent"],
            },
        )
    size = os.path.getsize(root + "/" + name)
    if size > 50 * 1024 * 1024:
        raise ValueError("Archive exceeds free object limit; split this category before upload")
    digest = hashlib.sha256(open(root + "/" + name, "rb").read()).hexdigest()
    archives.append({"kind": kind.split("-")[0], "file": name, "bytes": size, "sha256": digest})
    print(kind, size)
manifest["archives"] = archives
json.dump(manifest, open(root + "/manifest.json", "w"))
