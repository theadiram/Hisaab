import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { ProjectMedia } from './model';
const filename = path.join(process.cwd(), 'data/acquisition/geography/assets.sqlite');
let connection: DatabaseSync | null = null,
  edition = 0;
function db() {
  if (!existsSync(filename)) throw new Error('Asset geography is not installed on this server.');
  const modified = statSync(filename).mtimeMs;
  if (!connection || edition !== modified) {
    connection?.close();
    connection = new DatabaseSync(filename, { readOnly: true });
    edition = modified;
  }
  return connection;
}
export type AssetDetail = {
  id: string;
  kind: string;
  title: string;
  category: string;
  state: string;
  location: [number, number];
  sourceIdentity: string;
  sourceRow: number;
  sourceHash: string;
  sourceUrl: string;
  sourceFile: string;
  geometry: GeoJSON.Geometry;
  sourceFields: Record<string, string | number | null>;
  edition: string;
  delivery: string;
  textReview: boolean;
  locationVerification: 'unreviewed_source_coordinate';
  spendingLinked: false;
  photos: ProjectMedia[];
  buildingFootprint: GeoJSON.Polygon | GeoJSON.MultiPolygon | null;
};
export function assetDetail(id: string): AssetDetail | null {
  const row = db()
    .prepare(
      'select a.*,s.metadata from assets a join sources s on s.hash=a.source_hash where a.id=?',
    )
    .get(id);
  if (!row) return null;
  const source = JSON.parse(row.metadata as string);
  return {
    id: row.id as string,
    kind: row.kind as string,
    title: row.title as string,
    category: row.category as string,
    state: row.state as string,
    location: [row.lng as number, row.lat as number],
    sourceIdentity: row.source_identity as string,
    sourceRow: row.source_row as number,
    sourceHash: row.source_hash as string,
    sourceUrl: source.url,
    sourceFile: source.path,
    geometry: row.geometry
      ? JSON.parse(row.geometry as string)
      : { type: 'Point', coordinates: [row.lng, row.lat] },
    sourceFields: {
      ...JSON.parse(row.source_fields as string),
      STATE_ID: row.state_id,
      DISTRICT_I: row.district_id,
      BLOCK_ID: row.block_id,
      ...(row.kind === 'road'
        ? {}
        : {
            FACILITY_I: Number(row.source_identity),
            FAC_DESC: row.title,
            FAC_CATEGO: row.category,
          }),
    },
    edition: source.sourceEdition,
    delivery: source.delivery,
    textReview: !!row.text_review,
    locationVerification: 'unreviewed_source_coordinate',
    spendingLinked: false,
    photos: [],
    buildingFootprint: null,
  };
}
export function assetMap(
  bounds: number[],
  query: string,
  kind: string | null,
  members: boolean,
  offset: number,
  cells = 16,
  countOnly = false,
) {
  const [west, south, east, north] = bounds;
  const condition = `from assets a join asset_bounds b on b.row_id=a.row_id where b.max_lng>=? and b.min_lng<=? and b.max_lat>=? and b.min_lat<=? and a.lng between ? and ? and a.lat between ? and ? and instr(lower(a.title||' '||a.state||' '||a.source_identity),lower(?))>0 and (? is null or a.kind=?)`;
  const args = [west, east, south, north, west, east, south, north, query, kind, kind];
  if (countOnly)
    return {
      total: Number(
        db()
          .prepare('select count(*) n ' + condition)
          .get(...args)!.n,
      ),
      spendingLinked: false,
      edition: '2022 archived mirror',
    };
  if (members) {
    const total = db()
      .prepare('select count(*) n ' + condition)
      .get(...args)!.n;
    const rows = db()
      .prepare(
        'select a.id,a.title,a.kind,a.state ' + condition + ' order by a.id limit 25 offset ?',
      )
      .all(...args, offset);
    return { total, assets: rows, spendingLinked: false, edition: '2022 archived mirror' };
  }
  const rows = db()
    .prepare(
      `select min(${cells - 1},cast((a.lng-?)/?*${cells} as integer)) x,min(${cells - 1},cast((a.lat-?)/?*${cells} as integer)) y,count(*) n,avg(a.lng) lng,avg(a.lat) lat,min(a.lng) west,min(a.lat) south,max(a.lng) east,max(a.lat) north,min(a.id) id,min(a.title) title,min(a.kind) kind ${condition} group by 1,2 order by 1,2`,
    )
    .all(west, east - west, south, north - south, ...args);
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties:
        Number(r.n) === 1
          ? { cluster: false, count: 1, id: r.id, title: r.title, kind: r.kind }
          : { cluster: true, count: r.n, bounds: [r.west, r.south, r.east, r.north] },
    })),
    total: rows.reduce((n, r) => n + Number(r.n), 0),
    edition: '2022 archived mirror',
    spendingLinked: false,
  };
}

// Every record is retained, including co-located points. Tile coordinates are
// quantized for drawing only; receipt coordinates remain the original values.
export function assetTile(z: number, x: number, y: number, query: string, kind: string | null) {
  const n = 2 ** z,
    extent = 8192;
  const latitude = (v: number) =>
    (Math.atan(Math.sinh(Math.PI * (1 - (2 * v) / n))) * 180) / Math.PI;
  const west = (x / n) * 360 - 180,
    east = ((x + 1) / n) * 360 - 180,
    north = latitude(y),
    south = latitude(y + 1);
  const rows = db()
    .prepare(
      `select a.row_id,a.id,a.kind,a.lng,a.lat from assets a join asset_bounds b on b.row_id=a.row_id where b.max_lng>=? and b.min_lng<=? and b.max_lat>=? and b.min_lat<=? and a.lng>=? and a.lng<? and a.lat>? and a.lat<=? and (?='' or instr(lower(a.title||' '||a.state||' '||a.source_identity),lower(?))>0) and (? is null or a.kind=?)`,
    )
    .all(west, east, south, north, west, east, south, north, query, query, kind, kind);
  return {
    features: rows.map((r) => {
      const lat = (Number(r.lat) * Math.PI) / 180;
      return {
        id: Number(r.row_id),
        type: 1,
        geometry: [
          [
            Math.round((((Number(r.lng) + 180) / 360) * n - x) * extent),
            Math.round((((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * n - y) * extent),
          ],
        ],
        tags: { assetId: String(r.id), kind: String(r.kind) },
      };
    }),
  };
}
