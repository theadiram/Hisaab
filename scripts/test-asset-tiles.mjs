import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url),
  tileRequire = createRequire(require.resolve('vt-pbf'));
const { VectorTile } = tileRequire('@mapbox/vector-tile'),
  Pbf = tileRequire('pbf');
const report = JSON.parse(await readFile('data/geosadak-acquisition.json', 'utf8'));
const origin = 'http://127.0.0.1:3000',
  ids = new Set(),
  counts = {};
let total = 0,
  bytes = 0,
  sample;
for (const x of [11, 12])
  for (const y of [6, 7]) {
    const r = await fetch(`${origin}/api/v1/map/asset-tiles/4/${x}/${y}.pbf`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'application/vnd.mapbox-vector-tile');
    const body = new Uint8Array(await r.arrayBuffer()),
      layer = new VectorTile(new Pbf(body)).layers.assets;
    bytes += body.byteLength;
    assert.equal(layer.length, Number(r.headers.get('x-asset-count')));
    assert.equal(layer.extent, 8192);
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      assert.equal(f.type, 1);
      const id = f.properties.assetId;
      assert.match(id, /^[a-f0-9]{20}:\d+$/);
      assert.ok(!ids.has(id), 'Records must belong to exactly one tile');
      ids.add(id);
      counts[f.properties.kind] = (counts[f.properties.kind] || 0) + 1;
      assert.deepEqual(Object.keys(f.properties).sort(), ['assetId', 'kind']);
      assert.equal(f.loadGeometry()[0].length, 1);
      if (!sample) sample = { feature: f.toGeoJSON(x, y, 4), id };
    }
    total += layer.length;
  }
assert.equal(total, report.assetRows);
assert.deepEqual(counts, report.byKind);
const detail = await (await fetch(origin + '/api/v1/assets/' + sample.id)).json();
const [lng, lat] = sample.feature.geometry.coordinates;
assert.ok(Math.abs(lng - detail.asset.location[0]) <= 22.5 / 8192);
assert.ok(Math.abs(lat - detail.asset.location[1]) <= 22.5 / 8192);
const schoolResponse = await fetch(origin + '/api/v1/map/asset-tiles/4/11/7.pbf?kind=education');
const schools = new VectorTile(new Pbf(new Uint8Array(await schoolResponse.arrayBuffer()))).layers
  .assets;
for (let i = 0; i < schools.length; i++)
  assert.equal(schools.feature(i).properties.kind, 'education');
const searched = await fetch(
  origin + '/api/v1/map/asset-tiles/4/11/7.pbf?q=nonexistent-hisaab-asset-xyz',
);
assert.equal(searched.headers.get('x-asset-count'), '0');
for (const path of ['15/0/0.pbf', '4/16/0.pbf', '4/11/7.pbf?kind=bad'])
  assert.equal((await fetch(origin + '/api/v1/map/asset-tiles/' + path)).status, 400);
console.log(
  JSON.stringify({
    individualTileRecords: total,
    uniqueIds: ids.size,
    byKind: counts,
    bytes,
    noClustering: true,
    noSampling: true,
    onePointPerRecord: true,
    filteredSchools: schools.length,
    sourceCoordinateRoundTrip: true,
  }),
);
