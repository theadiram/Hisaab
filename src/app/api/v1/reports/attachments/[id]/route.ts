import { cookies } from 'next/headers';
import { readAttachment } from '@/lib/attachments';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token) return Response.json({ error: 'Private session required' }, { status: 401, headers });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: 'Attachment not found' }, { status: 404, headers });
  try {
    const bytes = await readAttachment(token, id);
    if (!bytes) return Response.json({ error: 'Attachment not found' }, { status: 404, headers });
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="hisaab-private-attachment.pdf"',
        'Content-Security-Policy': "sandbox; default-src 'none'",
      },
    });
  } catch {
    return Response.json({ error: 'Private attachment unavailable' }, { status: 404, headers });
  }
}
