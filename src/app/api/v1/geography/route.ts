import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { geographyStatus, hostedGeographyEnabled } from '@/lib/hosted-geography';
import { historicalCacheHeaders } from '@/lib/historical-cache';
export async function GET() {
  try {
    if (hostedGeographyEnabled())
      return Response.json(await geographyStatus(), { headers: historicalCacheHeaders(300, 300) });
    if (!existsSync(path.join(process.cwd(), 'data/acquisition/geography/assets.sqlite')))
      throw new Error('Geography not installed');
    const metadata: {
      count: number;
      maxzoom: number;
      delivery: string;
      spendingLinked: false;
      edition?: string;
      shards?: { id: string; kind: string }[];
    } = { count: 812976, maxzoom: 14, delivery: 'local_sqlite', spendingLinked: false };
    // R2 still draws individual dots; local SQLite supplies counts and asset cards.
    if (process.env.NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL) {
      const manifest = JSON.parse(
        await readFile(
          path.join(process.cwd(), 'data/acquisition/geography/hosted/manifest.json'),
          'utf8',
        ),
      );
      if (
        manifest.version !== 'hisaab-geography/1' ||
        manifest.count !== metadata.count ||
        !Array.isArray(manifest.archives) ||
        !manifest.archives.length
      )
        throw new Error('Local geography edition is incomplete');
      metadata.edition = manifest.edition;
      metadata.maxzoom = manifest.maxzoom;
      metadata.shards = manifest.archives.map((a: { file: string; kind: string }) => ({
        id: a.file.replace(/\.pmtiles$/, ''),
        kind: a.kind,
      }));
    }
    return Response.json(metadata, { headers: historicalCacheHeaders(300, 300) });
  } catch {
    return Response.json(
      { error: 'Geography delivery unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
