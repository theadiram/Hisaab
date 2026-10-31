"""Derive a display mask from the SOI outline, never project-location evidence."""

import io, json, hashlib, zipfile
from pathlib import Path
import shapefile
from pyproj import CRS, Transformer
from shapely.geometry import shape, mapping, box, LineString
from shapely.ops import transform
from shapely import make_valid, orient_polygons

ROOT = Path(__file__).resolve().parents[1]
archive = ROOT / ".hisaab/india-outline.zip"
with zipfile.ZipFile(archive) as z:
    reader = shapefile.Reader(
        shp=io.BytesIO(z.read("Outline_of_India.shp")),
        shx=io.BytesIO(z.read("Outline_of_India.shx")),
        dbf=io.BytesIO(z.read("Outline_of_India.dbf")),
    )
    assert len(reader) == 1 and reader.shapeType == 5
    projection = CRS.from_wkt(z.read("Outline_of_India.prj").decode())
    source = make_valid(shape(reader.shape(0).__geo_interface__))
    # Simplify in the source's metre projection, not degrees. This is a display
    # outline generalized by SOI, unsuitable for validating individual locations.
    simplified = source.simplify(150, preserve_topology=True)
    india = transform(
        Transformer.from_crs(projection, "EPSG:4326", always_xy=True).transform, simplified
    )
    assert (
        india.is_valid
        and 67 < india.bounds[0] < 70
        and india.bounds[2] > 97
        and india.bounds[1] < 7
        and india.bounds[3] > 35
    )
    india = orient_polygons(india)
    mask = orient_polygons(box(-180, -85, 180, 85).difference(india))
    target = ROOT / "public/geography/india-display.geojson"
    pieces = []
    for x in range(-180, 180, 10):
        for y in range(-85, 85, 10):
            piece = orient_polygons(box(x, y, min(x + 10, 180), min(y + 10, 85)).difference(india))
            if not piece.is_empty:
                pieces.append(
                    {
                        "type": "Feature",
                        "properties": {"role": "outside"},
                        "geometry": mapping(piece),
                    }
                )
    grid = []
    for lng in range(25, 145, 5):
        g = LineString([(lng, -45), (lng, 70)]).difference(india)
        if not g.is_empty:
            grid.append({"type": "Feature", "properties": {"role": "grid"}, "geometry": mapping(g)})
    for lat in range(-40, 70, 5):
        g = LineString([(20, lat), (145, lat)]).difference(india)
        if not g.is_empty:
            grid.append({"type": "Feature", "properties": {"role": "grid"}, "geometry": mapping(g)})
    target.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": pieces
                + grid
                + [
                    {
                        "type": "Feature",
                        "properties": {"role": "outline"},
                        "geometry": mapping(india),
                    }
                ],
            },
            separators=(",", ":"),
        )
    )
    metadata = {
        "source": "Survey of India",
        "sourceUrl": "https://surveyofindia.gov.in/documents/Outline_of_India.zip",
        "sourcePage": "https://surveyofindia.gov.in/pages/outline-maps-of-india",
        "permissionNotice": "https://www.surveyofindia.gov.in/documents/ibd-vectorformat.pdf",
        "usage": "Individual, internal, educational, research and website purposes; no commercial usage permitted by SOI notice",
        "sourceScale": "Generalized 1:16m per download page; permission notice refers to 1:15m",
        "originalSha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "outputSha256": hashlib.sha256(target.read_bytes()).hexdigest(),
        "displaySimplificationMetres": 150,
        "bounds": list(india.bounds),
        "purpose": "Display mask only; never asset location validation",
        "bytes": target.stat().st_size,
    }
    (ROOT / "data/india-display-outline.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(json.dumps(metadata))
