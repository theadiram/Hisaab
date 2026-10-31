// Read-only delivery audit against the preserved local catalogue.
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
const root = 'data/acquisition/geography/hosted',
  manifest = JSON.parse(readFileSync(root + '/manifest.json')),
  db = new DatabaseSync('data/acquisition/geography/assets.sqlite', { readOnly: true });
let count = 0,
  tiles = 0;
for (const a of manifest.archives) {
  const bytes = readFileSync(root + '/' + a.file);
  if (createHash('sha256').update(bytes).digest('hex') !== a.sha256)
    throw new Error('Archive checksum changed');
  const reader = new PMTiles({
      getKey: () => a.file,
      getBytes: async (o, l) => ({
        data: bytes.buffer.slice(bytes.byteOffset + o, bytes.byteOffset + o + l),
      }),
    }),
    tile = await reader.getZxy(0, 0, 0);
  count += new VectorTile(new Pbf(new Uint8Array(tile.data))).layers.assets.length;
}
const zcounts = new DatabaseSync(root + '/tiles.mbtiles', { readOnly: true })
  .prepare('select z,sum(n) n from tiles where kind not like ? group by z')
  .all('public-%');
for (const z of zcounts)
  if (Number(z.n) !== 812976) throw new Error('Encoded zoom lost a source point');
const base = 'http://127.0.0.1:3000',
  samples = db
    .prepare('select * from assets where row_id in (1,10000,200000,400000,600000,800000,812976)')
    .all();
for (const row of samples) {
  const response = await fetch(base + '/api/v1/assets/' + encodeURIComponent(row.id));
  if (!response.ok) throw new Error('Hosted receipt failed');
  const actual = (await response.json()).asset;
  if (
    actual.id !== row.id ||
    actual.location[0] !== row.lng ||
    actual.location[1] !== row.lat ||
    actual.sourceHash !== row.source_hash ||
    JSON.stringify(actual.geometry) !==
      JSON.stringify(
        row.geometry
          ? JSON.parse(row.geometry)
          : { type: 'Point', coordinates: [row.lng, row.lat] },
      )
  )
    throw new Error('Original identity/coordinate/geometry changed');
}
for (const a of manifest.archives) {
  const response = await fetch(
    base + '/api/v1/map/asset-tiles/0/0/0.pbf?shard=' + a.file.replace('.pmtiles', ''),
  );
  if (!response.ok) throw new Error('Hosted tile failed');
  const layer = new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer()))).layers.assets;
  tiles += layer.length;
}
if (count !== 812976 || tiles !== count) throw new Error('Delivered catalogue lost points');
const result = {
  checkedAt: new Date().toISOString(),
  count,
  hostedDelivered: tiles,
  encodedZooms: zcounts.map((z) => ({ z: z.z, count: z.n })),
  exactReceiptSamples: samples.length,
  manifestHash: JSON.parse(readFileSync(root + '/upload-status.json')).manifestHash,
};
writeFileSync(root + '/verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
