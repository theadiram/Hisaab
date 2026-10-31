import { requireAdmin } from '@/lib/admin';
import { pilotCards } from '@/lib/mplads-pilot';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to view draft receipts.' },
      { status: 401, headers },
    );
  }
  const document = new URL(request.url).searchParams.get('document');
  if (document !== null && !/^[a-f0-9]{64}$/.test(document))
    return Response.json({ error: 'Invalid document reference' }, { status: 400, headers });
  try {
    const root = path.join(process.cwd(), 'data/acquisition/mplads/supporting-records');
    const cards = pilotCards(
      JSON.parse(await readFile(path.join(root, 'pilot-review.json'), 'utf8')),
    );
    if (document === null) return Response.json({ cards }, { headers });
    const item = cards.flatMap((c) => c.documents).find((d) => d.id === document);
    if (!item) return Response.json({ error: 'Document not found' }, { status: 404, headers });
    const bytes = await readFile(path.join(root, `${item.id}.${item.extension}`));
    const magic =
      item.extension === 'pdf'
        ? bytes.subarray(0, 5).toString() === '%PDF-'
        : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (
      bytes.length > 20 * 1024 * 1024 ||
      !magic ||
      createHash('sha256').update(bytes).digest('hex') !== item.id
    )
      throw new Error('Integrity check failed');
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        'Content-Type': item.extension === 'pdf' ? 'application/pdf' : 'image/jpeg',
        'Content-Disposition': `inline; filename="evidence-${item.id}.${item.extension}"`,
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          'Private pilot evidence unavailable or integrity check failed. No publication status changed.',
      },
      { status: 503, headers },
    );
  }
}
