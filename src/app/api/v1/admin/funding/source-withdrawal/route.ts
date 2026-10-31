import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { z } from 'zod';
const headers = { 'Cache-Control': 'private, no-store' },
  input = z
    .object({
      documentId: z.uuid(),
      reason: z.string().trim().min(30).max(3000),
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
    return Response.json({ error: 'Verified owner MFA required' }, { status: 401, headers });
  }
  try {
    const r = input.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000)))),
      result = await admin.client.rpc('withdraw_funding_source', {
        p_document: r.documentId,
        p_reason: r.reason,
      });
    if (result.error) throw result.error;
    return Response.json({ withdrawn: true }, { headers });
  } catch {
    return Response.json(
      { error: 'A documented source withdrawal is required' },
      { status: 400, headers },
    );
  }
}
