import { z } from 'zod';
import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/admin';
import { reportClient, decryptBytes, decryptedJson, encryptedJson } from '@/lib/reports';
import { videoBytes, type VideoMeta } from '@/lib/case-videos';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
type Evidence = {
  documents: { id: string; path: string; sha256: string; metadata: { blob: string } }[];
  photos: { id: string; path: string; sha256: string }[];
  videos: { id: string; path: string; paths: string[]; payload: { blob: string } }[];
};
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'Live MFA owner access required' }, { status: 401, headers });
  }
  try {
    const p = new URL(request.url).searchParams,
      id = z.uuid().parse(p.get('id')),
      r = await admin.client.rpc('admin_complaint_evidence', { p_id: id });
    if (r.error) throw r.error;
    const evidence = r.data as Evidence,
      file = p.get('file'),
      kind = p.get('kind');
    if (!file)
      return Response.json(
        {
          documents: await Promise.all(
            evidence.documents.map(async (d) => ({
              id: d.id,
              sha256: d.sha256,
              ...(await decryptedJson(d.metadata)),
            })),
          ),
          photos: evidence.photos.map(({ id }) => ({ id })),
          videos: await Promise.all(
            evidence.videos.map(async (v) => ({
              id: v.id,
              name: ((await decryptedJson(v.payload)) as VideoMeta).name,
            })),
          ),
        },
        { headers },
      );
    const client = reportClient();
    let bytes: Buffer,
      contentType = 'application/octet-stream';
    if (kind === 'video') {
      const v = evidence.videos.find((v) => v.id === file);
      if (!v) throw new Error('Evidence unavailable');
      const metadata = (await decryptedJson(v.payload)) as VideoMeta;
      bytes = await videoBytes({ ...v, metadata });
      contentType = metadata.mime;
    } else if (kind === 'document') {
      const d = evidence.documents.find((d) => d.id === file);
      if (!d) throw new Error('Evidence unavailable');
      const result = await client.storage.from('case-documents').download(d.path);
      if (result.error) throw result.error;
      bytes = await decryptBytes(Buffer.from(await result.data.arrayBuffer()));
      if (createHash('sha256').update(bytes).digest('hex') !== d.sha256)
        throw new Error('Checksum mismatch');
    } else if (kind === 'photo') {
      const d = evidence.photos.find((d) => d.id === file);
      if (!d) throw new Error('Evidence unavailable');
      const result = await client.storage.from('case-derivatives').download(d.path);
      if (result.error) throw result.error;
      bytes = Buffer.from(await result.data.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== d.sha256)
        throw new Error('Checksum mismatch');
      contentType = 'image/webp';
    } else throw new Error('Invalid evidence type');
    return new Response(new Uint8Array(bytes), {
      headers: {
        ...headers,
        'Content-Type': contentType,
        ...(kind === 'document'
          ? {
              'Content-Disposition': 'attachment; filename="private-evidence.pdf"',
              'Content-Security-Policy': "sandbox; default-src 'none'",
            }
          : {}),
      },
    });
  } catch {
    return Response.json(
      { error: 'Private evidence unavailable for this live complaint' },
      { status: 404, headers },
    );
  }
}
const acknowledgement = z
  .object({
    id: z.uuid(),
    attachmentId: z.uuid(),
    reference: z.string().trim().min(1).max(200),
    date: z.iso.date().refine((d) => new Date(d) <= new Date()),
    reason: z.string().trim().min(30).max(2000),
    confirmed: z.literal(true),
  })
  .strict();
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'Live MFA owner access required' }, { status: 401, headers });
  }
  try {
    const input = acknowledgement.parse(
        JSON.parse(new TextDecoder().decode(await boundedBody(request, 5000))),
      ),
      payload = await encryptedJson({
        date: input.date,
        reference: input.reference,
        attachmentId: input.attachmentId,
        description: input.reason,
      });
    const r = await admin.client.rpc('acknowledge_complaint', {
      p_id: input.id,
      p_attachment: input.attachmentId,
      p_payload: payload,
      p_reason: input.reason,
    });
    if (r.error || !r.data) throw new Error('Documentary acknowledgement could not be recorded');
    return Response.json(
      { status: 'acknowledged', verification: 'owner_reviewed_document' },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Preserved acknowledgement, official reference and documented MFA review required' },
      { status: 400, headers },
    );
  }
}
