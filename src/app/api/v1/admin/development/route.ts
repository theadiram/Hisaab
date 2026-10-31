import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { developmentSchema } from '@/lib/development';
const review = z
  .object({
    id: z.string().min(1),
    action: z.enum(['publish', 'withdraw', 'classify']),
    patch: z.record(z.string(), z.unknown()).optional(),
    reason: z.string().min(30).max(3000),
    decisions: z
      .object({
        sourceChecked: z.boolean(),
        unitsChecked: z.boolean(),
        jurisdictionChecked: z.boolean(),
        scopeChecked: z.boolean(),
        editionsChecked: z.boolean(),
        nonOverlapChecked: z.boolean(),
        confirmed: z.boolean(),
      })
      .strict(),
  })
  .strict();
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA owner access required' }, { status: 401, headers });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 240)
    return Response.json({ error: 'Record required' }, { status: 400, headers });
  const result = await admin.client.rpc('admin_development_record', { p_id: id });
  return result.error
    ? Response.json({ error: 'Private draft unavailable' }, { status: 503, headers })
    : Response.json({ record: result.data }, { headers });
}
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
    const input = review.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
    );
    const original = await admin.client.rpc('admin_development_record', { p_id: input.id });
    if (original.error || !original.data) throw new Error('Draft unavailable');
    if (input.action === 'classify') {
      const allowed = [
        'classification',
        'purpose',
        'scope',
        'origin',
        'reconciliationKey',
        'disjointEvidence',
        'shares',
        'aggregation',
        'parentKey',
        'notes',
        'instrument',
      ];
      if (!input.patch || Object.keys(input.patch).some((k) => !allowed.includes(k)))
        throw new Error('Only documented classification fields may change');
      developmentSchema.parse({ ...original.data.payload, ...input.patch });
      const saved = await admin.client.rpc('classify_development', {
        p_id: input.id,
        p_patch: input.patch,
        p_reason: input.reason,
      });
      if (saved.error) throw saved.error;
      return Response.json({ classified: true, published: false }, { headers });
    }
    developmentSchema.parse(original.data.payload);
    const result = await admin.client.rpc('review_development', {
      p_id: input.id,
      p_decisions: input.decisions,
      p_reason: input.reason,
      p_action: input.action,
    });
    if (result.error) throw result.error;
    return Response.json({ reviewed: true }, { headers });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
