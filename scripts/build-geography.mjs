// Reproducible static delivery. Every location is retained at every encoded zoom.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import encoder from 'vt-pbf';
const root = 'data/acquisition/geography/hosted';
mkdirSync(root, { recursive: true });
const input = new DatabaseSync('data/acquisition/geography/assets.sqlite', { readOnly: true }),
  out = new DatabaseSync(root + '/tiles.mbtiles');
out.exec(
  'create table if not exists tiles(kind text,z integer,x integer,y integer,data blob,n integer,primary key(kind,z,x,y));create table if not exists checkpoint(kind text,z integer,primary key(kind,z))',
);
const rows = input
    .prepare('select row_id,id,kind,title,state,lng,lat from assets order by row_id')
    .all(),
  extent = 65536,
  maxzoom = 9;
const sha = (b) => createHash('sha256').update(b).digest('hex'),
  files = [];
function file(name, obj) {
  const b = gzipSync(Buffer.from(JSON.stringify(obj)));
  writeFileSync(root + '/' + name, b);
  files.push({ name, bytes: b.length, sha256: sha(b) });
  return name;
}
const sources = input
  .prepare('select hash,metadata from sources order by hash')
  .all()
  .map((s) => ({ hash: s.hash, ...JSON.parse(s.metadata) }));
const detailChunks = [];
for (const s of sources) {
  const details = input
    .prepare('select * from assets where source_hash=? order by source_row')
    .all(s.hash);
  for (let i = 0; i < details.length; i += 1000) {
    const chunk = details.slice(i, i + 1000),
      name = 'details-' + s.hash.slice(0, 20) + '-' + Math.floor(i / 1000) + '.json.gz';
    file(name, chunk);
    detailChunks.push({
      source: s.hash.slice(0, 20),
      min: chunk[0].source_row,
      max: chunk.at(-1).source_row,
      file: name,
    });
  }
}
const spatial = new Map();
for (const r of rows) {
  const key = Math.floor((r.lng + 180) / 5) + ',' + Math.floor((r.lat + 90) / 5);
  const chunk = spatial.get(key) ?? [];
  chunk.push(r);
  spatial.set(key, chunk);
}
const index = [];
for (const [key, chunk] of spatial) {
  const [x, y] = key.split(',').map(Number),
    name = file('index-' + x + '-' + y + '.json.gz', chunk);
  index.push({
    file: name,
    bounds: [x * 5 - 180, y * 5 - 90, (x + 1) * 5 - 180, (y + 1) * 5 - 90],
    records: chunk.length,
  });
}
writeFileSync(
  root + '/manifest.json',
  JSON.stringify({
    version: 'hisaab-geography/1',
    edition: '2022 archived mirror',
    count: rows.length,
    extent,
    maxzoom,
    sources,
    detailChunks,
    index,
    files,
    archives: [],
    licence: 'Government Open Data License – India; DataMeet archived source mirror',
    spendingLinked: false,
  }),
);
for (const kind of [...new Set(rows.map((r) => r.kind))])
  for (let z = 0; z <= maxzoom; z++) {
    if (out.prepare('select 1 from checkpoint where kind=? and z=?').get(kind, z)) continue;
    const n = 2 ** z,
      tiles = new Map();
    for (const r of rows) {
      if (r.kind !== kind) continue;
      const tx = ((r.lng + 180) / 360) * n,
        ty = ((1 - Math.asinh(Math.tan((r.lat * Math.PI) / 180)) / Math.PI) / 2) * n,
        x = Math.floor(tx),
        y = Math.floor(ty),
        key = x + ',' + y,
        features = tiles.get(key) ?? [];
      features.push({
        id: r.row_id,
        type: 1,
        geometry: [[Math.round((tx - x) * extent), Math.round((ty - y) * extent)]],
        tags: { assetId: r.id, kind, title: r.title, state: r.state },
      });
      tiles.set(key, features);
    }
    out.exec('begin');
    const insert = out.prepare('insert or replace into tiles values(?,?,?,?,?,?)');
    let count = 0;
    for (const [key, features] of tiles) {
      const [x, y] = key.split(',').map(Number),
        b = encoder.fromGeojsonVt({ assets: { features } }, { version: 2, extent });
      insert.run(kind, z, x, y, gzipSync(b), features.length);
      count += features.length;
    }
    if (count !== rows.filter((r) => r.kind === kind).length) throw new Error('Feature loss');
    out.prepare('insert into checkpoint values(?,?)').run(kind, z);
    out.exec('commit');
    console.log(kind, z, count, tiles.size);
  }
out.close();
input.close();
