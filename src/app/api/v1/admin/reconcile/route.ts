import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { workSchema } from '@/lib/validation';
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
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 200000)));
    if (typeof value.reason !== 'string' || value.reason.length < 20 || value.confirmed !== true)
      throw new Error('Documented reconciliation and confirmation required');
    const work = workSchema.parse(value.work);
    const result = await admin.client.rpc('reconcile_candidate', {
      p_id: work.id,
      p_payload: work,
      p_reason: value.reason,
    });
    if (result.error) throw result.error;
    return Response.json({ saved: true }, { headers });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
