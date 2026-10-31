// Export only already-public historical map data. No private intake or payments.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import encoder from 'vt-pbf';
import path from 'node:path';

const archiveRoot = 'data/acquisition/geography/hosted';
const original = JSON.parse(readFileSync(archiveRoot + '/manifest.json', 'utf8'));
const overview = JSON.parse(readFileSync('data/map-overview.json', 'utf8'));
if (original.count !== overview.count) throw new Error('Map editions disagree');
const sourceKey = createHash('sha256')
  .update(JSON.stringify(original.sources.map((s) => s.hash).sort()))
  .digest('hex');
if (sourceKey !== overview.sourceKey) throw new Error('Map source hashes disagree');
const root = 'data/acquisition/geography/r2-map',
  files = [];
mkdirSync(root, { recursive: true });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function save(key, bytes, contentType, contentEncoding) {
  const target = path.join(root, key);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  files.push({
    key,
    bytes: bytes.length,
    sha256: digest(bytes),
    contentType,
    ...(contentEncoding ? { contentEncoding } : {}),
  });
}
for (const name of ['india-display', 'funding-states'])
  save(
    `boundaries/${name}.geojson`,
    gzipSync(readFileSync(`public/geography/${name}.geojson`)),
    'application/geo+json',
    'gzip',
  );
for (const file of overview.files) {
  const input = readFileSync('public' + overview.urlTemplate.replace('{z}', String(file.zoom)));
  if (digest(input) !== file.sha256) throw new Error('Overview checksum mismatch');
  save(`overview/z${file.zoom}.geojson`, gzipSync(input), 'application/geo+json', 'gzip');
}
const db = new DatabaseSync(archiveRoot + '/tiles.mbtiles', { readOnly: true });
const names = original.archives.map((archive) => archive.file.replace('.pmtiles', ''));
const zoomTotals = {};
for (const tile of db
  .prepare('select kind,z,x,y,data,n from tiles where z>=? and z<=? order by kind,z,x,y')
  .iterate(overview.minDetailZoom, original.maxzoom)) {
  if (!names.includes(tile.kind)) continue;
  const layer = new VectorTile(new Pbf(gunzipSync(tile.data))).layers.assets,
    features = [];
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index);
    features.push({
      id: feature.id,
      type: feature.type,
      geometry: feature
        .loadGeometry()
        .flat()
        .map((p) => [p.x, p.y]),
      tags: feature.properties,
    });
  }
  const bytes = gzipSync(
    encoder.fromGeojsonVt({ assets: { features } }, { extent: original.extent, version: 2 }),
  );
  save(
    `tiles/${tile.kind}/${tile.z}/${tile.x}/${tile.y}.pbf`,
    bytes,
    'application/vnd.mapbox-vector-tile',
    'gzip',
  );
  zoomTotals[tile.z] = (zoomTotals[tile.z] ?? 0) + features.length;
}
for (let zoom = overview.minDetailZoom; zoom <= original.maxzoom; zoom++)
  if (zoomTotals[zoom] !== original.count) throw new Error('Detailed tiles lost records');
const edition = digest(Buffer.from(JSON.stringify(files))).slice(0, 20);
const manifest = {
  version: 'hisaab-static-map/1',
  edition,
  prefix: 'edition-' + edition,
  count: original.count,
  minzoom: overview.minDetailZoom,
  maxzoom: original.maxzoom,
  extent: original.extent,
  sourceKey,
  zoomTotals,
  files,
  cacheControl: 'public, max-age=31536000, immutable',
  totalBytes: files.reduce((n, f) => n + f.bytes, 0),
};
writeFileSync(root + '/manifest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log(
  JSON.stringify({
    edition,
    prefix: manifest.prefix,
    count: manifest.count,
    zoomTotals,
    files: files.length,
    totalMiB: Math.round((manifest.totalBytes / 1048576) * 100) / 100,
  }),
);
db.close();
