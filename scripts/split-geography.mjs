import { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import encoder from 'vt-pbf';
const db = new DatabaseSync('data/acquisition/geography/hosted/tiles.mbtiles'),
  insert = db.prepare('insert or replace into tiles values(?,?,?,?,?,?)');
for (let z = 0; z <= 9; z++) {
  if (db.prepare('select 1 from checkpoint where kind=? and z=?').get('public-split', z)) continue;
  db.exec('begin');
  for (const row of db.prepare('select * from tiles where kind=? and z=?').all('public', z)) {
    const layer = new VectorTile(new Pbf(gunzipSync(row.data))).layers.assets,
      parts = [[], [], []];
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      parts[f.id % 3].push({
        id: f.id,
        type: f.type,
        geometry: f
          .loadGeometry()
          .flat()
          .map((p) => [p.x, p.y]),
        tags: f.properties,
      });
    }
    for (let part = 0; part < parts.length; part++)
      if (parts[part].length)
        insert.run(
          'public-' + part,
          z,
          row.x,
          row.y,
          gzipSync(
            encoder.fromGeojsonVt(
              { assets: { features: parts[part] } },
              { extent: 65536, version: 2 },
            ),
          ),
          parts[part].length,
        );
  }
  db.prepare('insert into checkpoint values(?,?)').run('public-split', z);
  db.exec('commit');
  console.log('split', z);
}
db.close();
