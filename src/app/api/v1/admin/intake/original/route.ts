import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { reportClient } from '@/lib/reports';
import { boundedBody } from '@/lib/request-body';
const schema = z
  .object({
    sourceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z
      .number()
      .int()
      .positive()
      .max(10 * 1024 * 1024),
  })
  .strict();
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  try {
    await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA owner access required' }, { status: 401, headers });
  }
  try {
    const value = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 2000))),
    );
    const path = value.sourceId + '/' + value.hash,
      result = await reportClient()
        .storage.from('source-originals')
        .createSignedUploadUrl(path, { upsert: false });
    if (result.error) throw result.error;
    return Response.json({ path, token: result.data.token }, { headers });
  } catch {
    return Response.json(
      { error: 'Private original upload is unavailable' },
      { status: 400, headers },
    );
  }
}
