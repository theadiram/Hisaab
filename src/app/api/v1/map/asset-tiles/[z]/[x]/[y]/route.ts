import { hostedAssetTile, hostedGeographyEnabled } from '@/lib/hosted-geography';
import { assetTile } from '@/lib/asset-geography';
import { gzipSync } from 'node:zlib';
import encoder from 'vt-pbf';
import { historicalCacheHeaders } from '@/lib/historical-cache';
export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const p = await params;
  if (!/^\d+$/.test(p.z) || !/^\d+$/.test(p.x) || !/^\d+\.pbf$/.test(p.y))
    return Response.json({ error: 'Invalid tile' }, { status: 400 });
  const z = Number(p.z),
    x = Number(p.x),
    y = Number(p.y.slice(0, -4));
  if (z > 14 || x >= 2 ** z || y >= 2 ** z)
    return Response.json({ error: 'Invalid tile' }, { status: 400 });
  const search = new URL(request.url).searchParams,
    kind = search.get('kind'),
    shard = search.get('shard');
  if (
    shard &&
    !['agriculture', 'education', 'health', 'road', 'public-0', 'public-1', 'public-2'].includes(
      shard,
    )
  )
    return Response.json({ error: 'Invalid archive shard' }, { status: 400 });
  if (kind && !['education', 'health', 'road', 'public', 'agriculture', 'other'].includes(kind))
    return Response.json({ error: 'Invalid category' }, { status: 400 });
  try {
    if (hostedGeographyEnabled()) {
      const tile = await hostedAssetTile(
        z,
        x,
        y,
        (search.get('q') || '').slice(0, 200),
        kind,
        shard,
      );
      const bytes = gzipSync(tile.bytes);
      if (bytes.length > 4 * 1024 * 1024)
        return Response.json(
          { error: 'Use a bounded archive shard for this tile' },
          { status: 413 },
        );
      return new Response(new Uint8Array(bytes), {
        headers: {
          'Content-Encoding': 'gzip',
          'Content-Type': 'application/vnd.mapbox-vector-tile',
          ...historicalCacheHeaders(
            3600,
            /^[a-f0-9]{12}$/.test(search.get('v') ?? '') ? 86400 : 3600,
            'q|kind|shard|v',
          ),
          'X-Asset-Count': String(tile.count),
        },
      });
    }
    const tile = assetTile(z, x, y, (search.get('q') || '').slice(0, 200), kind);
    const bytes = encoder.fromGeojsonVt({ assets: tile }, { version: 2, extent: 8192 });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'application/vnd.mapbox-vector-tile',
        'Cache-Control': 'no-store',
        'X-Asset-Count': String(tile.features.length),
      },
    });
  } catch {
    return Response.json(
      { error: 'Asset geography unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
