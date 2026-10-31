import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { requireAdmin } from '@/lib/admin';
import { departmentExportReview } from '@/lib/department-export-review';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to inspect department exports.' },
      { status: 401, headers },
    );
  }
  const params = new URL(request.url).searchParams,
    query = params.get('q') ?? '',
    page = params.get('page') ?? '1';
  if (query.length > 100 || !/^\d{1,6}$/.test(page) || Number(page) < 1)
    return Response.json(
      { error: 'Use a short project or payment search and a valid page.' },
      { status: 400, headers },
    );
  try {
    const base = path.join(process.cwd(), 'data/acquisition/department-exports'),
      file = path.join(base, 'catalogue.json');
    if ((await stat(file)).size > 20000000) throw new Error('Oversized export review catalogue');
    const [raw, hash] = await Promise.all([
      readFile(file),
      readFile(path.join(base, 'catalogue.sha256'), 'utf8'),
    ]);
    if (createHash('sha256').update(raw).digest('hex') !== hash.trim())
      throw new Error('Export review checksum mismatch');
    return Response.json(
      departmentExportReview(JSON.parse(raw.toString('utf8')), query, Number(page)),
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          'Export review unavailable. Collection status is unknown; no empty coverage or approval inferred.',
      },
      { status: 503, headers },
    );
  }
}
