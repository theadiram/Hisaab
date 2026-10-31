import { boundedBody } from '@/lib/request-body';
import { requireOrigin } from '@/lib/security';
import { requireAdmin } from '@/lib/admin';
import { workSchema } from '@/lib/validation';
import { assertPublicationEvidence } from '@/lib/publication-evidence';
import { pendingCandidateSchema } from '@/lib/pending-candidate';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA administrator access required' }, { status: 401, headers });
  }
  const params = new URL(request.url).searchParams;
  if (params.has('id')) {
    const id = params.get('id') ?? '';
    if (
      params.size !== 1 ||
      params.getAll('id').length !== 1 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9:_./-]{0,239}$/.test(id)
    )
      return Response.json(
        { error: 'One exact candidate ID is required' },
        { status: 400, headers },
      );
    try {
      const result = await admin.client.rpc('admin_candidate', { p_id: id });
      if (result.error) throw result.error;
      if (!result.data)
        return Response.json(
          {
            error:
              'This exact pending candidate is unavailable. Prepare the batch review queue first, or inspect its publication history in the owner console.',
          },
          { status: 404, headers },
        );
      const parsed = pendingCandidateSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.id !== id) throw new Error('Candidate identity mismatch');
      return Response.json({ candidate: parsed.data }, { headers });
    } catch {
      return Response.json(
        { error: 'Exact candidate review is unavailable. No reconciliation was saved.' },
        { status: 503, headers },
      );
    }
  }
  const offset = Math.max(0, Math.min(10000000, Number(params.get('offset')) || 0));
  const query = (params.get('q') || '').slice(0, 200);
  try {
    const { data, error } = await admin.client.rpc('admin_candidates_page', {
      p_offset: Math.trunc(offset),
      p_limit: 100,
      p_query: query,
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      { error: 'Review queue temporarily unavailable. Please retry.' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA administrator access required' }, { status: 401, headers });
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000)));
    if (
      typeof body.id !== 'string' ||
      typeof body.reason !== 'string' ||
      body.reason.length < 20 ||
      body.confirmed !== true
    )
      throw new Error('A documented review and confirmation are required');
    if (body.action === 'withdraw') {
      const result = await admin.client.rpc('withdraw_reviewed_work', {
        p_id: body.id,
        p_reason: body.reason,
      });
      if (result.error) throw result.error;
      return Response.json({ withdrawn: true }, { headers });
    }
    const pending = await admin.client.rpc('admin_candidate', { p_id: body.id });
    if (pending.error) throw pending.error;
    const candidate = pending.data;
    if (!candidate) throw new Error('Candidate not found');
    const work = workSchema.parse(candidate);
    assertPublicationEvidence(work);
    const result = await admin.client.rpc('publish_reviewed_candidate', {
      p_id: body.id,
      p_payload: work,
      p_reason: body.reason,
    });
    if (result.error) throw result.error;
    return Response.json({ work, version: result.data }, { headers });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
