import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA owner access required' }, { status: 401, headers });
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 1000)));
    if (typeof body.batchId !== 'string' || body.batchId.length > 240)
      throw new Error('Batch required');
    const result = await admin.client.rpc('prepare_atlas_project_reviews', {
      p_batch: body.batchId,
    });
    if (result.error) throw result.error;
    return Response.json(
      { projects: result.data, publication: 'private_pending_review' },
      { headers },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
