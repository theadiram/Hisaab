import 'server-only';
import { BoundedCache } from './bounded-cache';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { PMTiles } from 'pmtiles';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import encoder from 'vt-pbf';
import type { AssetDetail } from './asset-geography';
type Chunk = {
  file: string;
  offset: number;
  length: number;
  sha256: string;
  bounds?: number[];
  source?: string;
  min?: number;
  max?: number;
  records?: number;
};
type Manifest = {
  version: string;
  count: number;
  extent: number;
  maxzoom: number;
  sources: Record<string, string>[];
  detailChunks: Chunk[];
  index: Chunk[];
  archives: { kind: string; file: string }[];
};
type Row = {
  row_id: number;
  id: string;
  kind: string;
  title: string;
  state: string;
  lng: number;
  lat: number;
  source_hash?: string;
  source_identity?: string;
  source_row?: number;
  geometry?: string;
  source_fields?: string;
  state_id?: string;
  district_id?: string;
  block_id?: string;
  text_review?: number;
};
let manifestPromise: Promise<Manifest> | null = null;
const readers = new Map<string, PMTiles>();
// Immutable public tiles are shared between concurrent visitors. Bound memory, not records.
const tileCache = new Map<string, { bytes: Uint8Array; count: number }>(),
  tileLoads = new Map<string, Promise<{ bytes: Uint8Array; count: number }>>();
let cachedTileBytes = 0;
export const hostedGeographyEnabled = () => !!process.env.HISAAB_GEOGRAPHY_MANIFEST;
function base() {
  const url = process.env.HISAAB_GEOGRAPHY_MANIFEST;
  if (!url?.startsWith('https://')) throw new Error('Hosted geography is not configured');
  return url;
}
async function manifest() {
  if (!manifestPromise)
    manifestPromise = fetch(base(), { cache: 'force-cache' })
      .then(async (r) => {
        if (!r.ok) throw new Error('Geography manifest unavailable');
        const m = (await r.json()) as Manifest;
        if (m.version !== 'hisaab-geography/1' || m.count !== 812976 || m.archives.length === 0)
          throw new Error('Incomplete geography edition');
        return m;
      })
      .catch((e) => {
        manifestPromise = null;
        throw e;
      });
  return manifestPromise;
}
const decodedChunks = new BoundedCache<Row[]>(
  64 * 1024 * 1024,
  64,
  60 * 60 * 1000,
  (rows) => Buffer.byteLength(JSON.stringify(rows)) * 3,
);
function chunk(c: Chunk) {
  return decodedChunks.get(JSON.stringify([base(), c.file, c.offset, c.length, c.sha256]), () =>
    loadChunk(c),
  );
}
async function loadChunk(c: Chunk) {
  const r = await fetch(new URL(c.file, base()), {
    headers: { Range: `bytes=${c.offset}-${c.offset + c.length - 1}` },
    cache: 'force-cache',
  });
  if (r.status !== 206) throw new Error('Storage range access unavailable');
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.length !== c.length || createHash('sha256').update(bytes).digest('hex') !== c.sha256)
    throw new Error('Geography checksum mismatch');
  return JSON.parse(gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString()) as Row[];
}
export async function hostedAssetDetail(id: string): Promise<AssetDetail | null> {
  const m = await manifest(),
    [prefix, number] = id.split(':'),
    rowNumber = Number(number),
    c = m.detailChunks.find(
      (c) => c.source === prefix && rowNumber >= c.min! && rowNumber <= c.max!,
    );
  if (!c) return null;
  const row = (await chunk(c)).find((r) => r.id === id);
  if (!row) return null;
  const s = m.sources.find((s) => s.hash === row.source_hash);
  if (!s) throw new Error('Source manifest missing');
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    category: String((row as Row & { category: string }).category ?? ''),
    state: row.state,
    location: [row.lng, row.lat],
    sourceIdentity: String(row.source_identity),
    sourceRow: row.source_row!,
    sourceHash: row.source_hash!,
    sourceUrl: s.url,
    sourceFile: s.path,
    geometry: row.geometry
      ? JSON.parse(row.geometry)
      : { type: 'Point', coordinates: [row.lng, row.lat] },
    sourceFields: {
      ...JSON.parse(row.source_fields ?? '{}'),
      STATE_ID: row.state_id,
      DISTRICT_I: row.district_id,
      BLOCK_ID: row.block_id,
      ...(row.kind === 'road'
        ? {}
        : {
            FACILITY_I: Number(row.source_identity),
            FAC_DESC: row.title,
            FAC_CATEGO: String((row as Row & { category: string }).category ?? ''),
          }),
    },
    edition: s.sourceEdition,
    delivery: s.delivery,
    textReview: !!row.text_review,
    locationVerification: 'unreviewed_source_coordinate',
    spendingLinked: false,
    photos: [],
    buildingFootprint: null,
  };
}
export async function hostedAssetMap(
  bounds: number[],
  query: string,
  kind: string | null,
  members: boolean,
  offset: number,
  countOnly: boolean,
) {
  const m = await manifest();
  let total = 0;
  const assets: Row[] = [];
  const [west, south, east, north] = bounds;
  for (const c of m.index) {
    const b = c.bounds!;
    if (b[0] > east || b[2] < west || b[1] > north || b[3] < south) continue;
    if (
      !query &&
      !kind &&
      b[0] >= west &&
      b[2] <= east &&
      b[1] >= south &&
      b[3] <= north &&
      c.records !== undefined &&
      (countOnly || (members && (total + c.records <= offset || assets.length >= 25)))
    ) {
      total += c.records;
      continue;
    }
    for (const row of await chunk(c)) {
      if (
        row.lng < west ||
        row.lng > east ||
        row.lat < south ||
        row.lat > north ||
        (kind && row.kind !== kind) ||
        ![row.title, row.state, row.id].join(' ').toLowerCase().includes(query.toLowerCase())
      )
        continue;
      if (members && total >= offset && assets.length < 25) assets.push(row);
      total++;
    }
  }
  if (countOnly || members)
    return {
      total,
      ...(members
        ? { assets: assets.map(({ id, title, kind, state }) => ({ id, title, kind, state })) }
        : {}),
      spendingLinked: false,
      edition: '2022 archived mirror',
    };
  throw new Error('Grouping is not used by the hosted individual-point map');
}
async function loadAssetTile(
  z: number,
  x: number,
  y: number,
  query: string,
  kind: string | null,
  shard: string | null,
) {
  const m = await manifest();
  if (z > m.maxzoom) throw new Error('Tile zoom exceeds the encoded edition');
  const features: {
    id: number;
    type: number;
    geometry: number[][];
    tags: Record<string, string>;
  }[] = [];
  for (const a of m.archives) {
    if ((kind && a.kind !== kind) || (shard && a.file !== shard + '.pmtiles')) continue;
    const url = new URL(a.file, base()).toString();
    let reader = readers.get(url);
    if (!reader) {
      reader = new PMTiles(url);
      readers.set(url, reader);
    }
    const tile = await reader.getZxy(z, x, y);
    if (!tile) continue;
    const layer = new VectorTile(new Pbf(new Uint8Array(tile.data))).layers.assets;
    if (!layer) continue;
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i);
      if (
        query &&
        ![f.properties.title, f.properties.state, f.properties.assetId]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase())
      )
        continue;
      features.push({
        id: f.id ?? i,
        type: f.type,
        geometry: f
          .loadGeometry()
          .flat()
          .map((p) => [p.x, p.y]),
        tags: { assetId: String(f.properties.assetId), kind: String(f.properties.kind) },
      });
    }
  }
  return {
    bytes: new Uint8Array(
      encoder.fromGeojsonVt({ assets: { features } }, { extent: m.extent, version: 2 }),
    ),
    count: features.length,
  };
}
export async function hostedAssetTile(
  z: number,
  x: number,
  y: number,
  query: string,
  kind: string | null,
  shard: string | null = null,
) {
  const key = JSON.stringify([base(), z, x, y, query, kind, shard]),
    cached = tileCache.get(key);
  if (cached) {
    tileCache.delete(key);
    tileCache.set(key, cached);
    return cached;
  }
  const pending = tileLoads.get(key);
  if (pending) return pending;
  const loading = loadAssetTile(z, x, y, query, kind, shard)
    .then((tile) => {
      const limit = 32 * 1024 * 1024;
      if (tile.bytes.byteLength <= limit) {
        while (cachedTileBytes + tile.bytes.byteLength > limit && tileCache.size) {
          const first = tileCache.keys().next().value!;
          cachedTileBytes -= tileCache.get(first)!.bytes.byteLength;
          tileCache.delete(first);
        }
        tileCache.set(key, tile);
        cachedTileBytes += tile.bytes.byteLength;
      }
      return tile;
    })
    .finally(() => tileLoads.delete(key));
  tileLoads.set(key, loading);
  return loading;
}
export async function geographyStatus() {
  const m = await manifest();
  return {
    count: m.count,
    maxzoom: m.maxzoom,
    edition: createHash('sha256').update(base()).digest('hex').slice(0, 12),
    delivery: 'immutable_pmtiles_and_range_index',
    shards: m.archives.map((a) => ({ id: a.file.replace('.pmtiles', ''), kind: a.kind })),
    spendingLinked: false,
  };
}
