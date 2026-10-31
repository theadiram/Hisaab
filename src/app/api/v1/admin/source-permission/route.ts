import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { z } from 'zod';
const schema = z.object({
  documentId: z.uuid(),
  basis: z.string().min(30).max(2000),
  evidence: z.string().min(20).max(2000),
  confirmed: z.literal(true),
});
const lookup = z
  .object({
    sourceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    url: z
      .url()
      .max(2048)
      .refine((v) => {
        const u = new URL(v);
        return u.protocol === 'https:' && !u.username && !u.password;
      }),
  })
  .strict();
const document = z.object({
  id: z.uuid(),
  sourceId: z.string(),
  hash: z.string(),
  url: z.string(),
  licenseBasis: z.string().nullable(),
  sourceApproved: z.boolean(),
  permissionReviewed: z.boolean(),
});
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA administrator required' }, { status: 401, headers });
  }
  let value: z.infer<typeof lookup>;
  try {
    const params = new URL(request.url).searchParams;
    for (const key of params.keys())
      if (!['sourceId', 'hash', 'url'].includes(key) || params.getAll(key).length !== 1)
        throw new Error('Invalid lookup');
    value = lookup.parse(Object.fromEntries(params));
  } catch {
    return Response.json(
      { error: 'Exact source ID, checksum and HTTPS URL are required' },
      { status: 400, headers },
    );
  }
  try {
    const result = await admin.client.rpc('admin_source_document_by_identity', {
      p_source_id: value.sourceId,
      p_hash: value.hash,
      p_url: value.url,
    });
    if (result.error) throw new Error('Lookup unavailable');
    if (!result.data)
      return Response.json(
        {
          error:
            'This exact original has not been registered. Upload it and stage its package first.',
        },
        { status: 404, headers },
      );
    const parsed = document.safeParse(result.data);
    if (
      !parsed.success ||
      parsed.data.sourceId !== value.sourceId ||
      parsed.data.hash !== value.hash ||
      parsed.data.url !== value.url
    )
      throw new Error('Identity mismatch');
    return Response.json({ document: parsed.data }, { headers });
  } catch {
    return Response.json(
      { error: 'Private source review is unavailable. No permission decision was changed.' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA administrator required' }, { status: 401, headers });
  }
  try {
    const value = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 16000))),
    );
    const result = await admin.client.rpc('verify_source_permission', {
      p_document: value.documentId,
      p_basis: value.basis,
      p_evidence: value.evidence,
    });
    if (result.error) throw result.error;
    return Response.json({ reviewed: true }, { headers });
  } catch {
    return Response.json(
      { error: 'Verified permission basis, evidence reference and confirmation are required' },
      { status: 400, headers },
    );
  }
}
