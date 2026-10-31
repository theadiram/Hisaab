// Build a lightweight, count-conserving overview from the original asset rows.
// Original records, archived tiles, and receipt coordinates are never modified.
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const db = new DatabaseSync('data/acquisition/geography/assets.sqlite', { readOnly: true });
const rows = db.prepare('select kind,lng,lat from assets').all();
const manifest = JSON.parse(
  readFileSync('data/acquisition/geography/hosted/manifest.json', 'utf8'),
);
const kinds = ['agriculture', 'education', 'health', 'public', 'road'];
if (rows.length !== manifest.count || rows.length !== 812976)
  throw new Error('Unexpected source record count');
const sourceKey = createHash('sha256')
  .update(JSON.stringify(manifest.sources.map((s) => s.hash).sort()))
  .digest('hex');
const outputs = [];
for (let zoom = 0; zoom < 6; zoom++) {
  const cells = 2 ** zoom * 8,
    groups = new Map();
  for (const row of rows) {
    const x = Math.floor(((row.lng + 180) / 360) * cells),
      lat = (row.lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * cells),
      key = x + ':' + y;
    let group = groups.get(key);
    if (!group) {
      group = {
        count: 0,
        lng: 0,
        lat: 0,
        bounds: [180, 90, -180, -90],
        counts: Object.fromEntries(kinds.map((kind) => [kind, 0])),
      };
      groups.set(key, group);
    }
    if (!(row.kind in group.counts)) throw new Error('Unexpected asset kind');
    group.count++;
    group.counts[row.kind]++;
    group.lng += row.lng;
    group.lat += row.lat;
    group.bounds = [
      Math.min(group.bounds[0], row.lng),
      Math.min(group.bounds[1], row.lat),
      Math.max(group.bounds[2], row.lng),
      Math.max(group.bounds[3], row.lat),
    ];
  }
  const features = [...groups.values()].map((group) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [group.lng / group.count, group.lat / group.count] },
    properties: { count: group.count, ...group.counts, bounds: group.bounds },
  }));
  const total = features.reduce((n, feature) => n + feature.properties.count, 0);
  if (total !== rows.length) throw new Error('Overview count mismatch');
  const bytes = Buffer.from(
    JSON.stringify({
      type: 'FeatureCollection',
      features,
      total,
      spendingLinked: false,
      edition: '2022 archived mirror',
      meaning: 'Grouped historical source locations; not independently verified current sites',
    }),
  );
  outputs.push({
    zoom,
    features: features.length,
    bytes,
    gzipBytes: gzipSync(bytes).length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
const edition = createHash('sha256')
  .update(outputs.map((file) => file.sha256).join(''))
  .digest('hex')
  .slice(0, 16);
const root = 'public/geography/overview/' + edition;
mkdirSync(root, { recursive: true });
for (const file of outputs) writeFileSync(`${root}/z${file.zoom}.geojson`, file.bytes);
const config = {
  version: 'hisaab-map-overview/1',
  count: rows.length,
  sourceKey,
  edition,
  minDetailZoom: 6,
  maxOverviewZoom: 5,
  urlTemplate: `/geography/overview/${edition}/z{z}.geojson`,
  files: outputs.map(({ bytes, ...file }) => ({ ...file, bytes: bytes.length })),
};
writeFileSync('data/map-overview.json', JSON.stringify(config, null, 2) + '\n');
console.log(JSON.stringify(config, null, 2));
db.close();
