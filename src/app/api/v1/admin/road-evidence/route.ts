import { requireAdmin } from '@/lib/admin';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Sign in with owner MFA to inspect unpublished financial evidence.' },
      { status: 401, headers },
    );
  }
  try {
    const saved = JSON.parse(
      await readFile(
        path.join(process.cwd(), 'data/acquisition/ommas-financial/road-financial-cases.json'),
        'utf8',
      ),
    );
    const hash = new URL(request.url).searchParams.get('original');
    if (hash) {
      if (hash !== saved.manifest.sha256)
        return Response.json({ error: 'Original not found' }, { status: 404, headers });
      const original = await readFile(
        path.join(process.cwd(), 'data/originals/ommas-road-financial', hash),
      );
      if (createHash('sha256').update(original).digest('hex') !== hash)
        throw new Error('Original checksum mismatch');
      return new Response(original, {
        headers: {
          ...headers,
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="ommas-odisha-road-financial-original.csv"',
        },
      });
    }
    return Response.json(
      {
        manifest: saved.manifest,
        cases: saved.cases.map((c: Record<string, unknown>) => ({
          ...c,
          geographyProposal: undefined,
          nationalRoadRaw: undefined,
          raw: undefined,
        })),
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Preserved road evidence is unavailable on this server.' },
      { status: 503, headers },
    );
  }
}
