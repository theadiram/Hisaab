import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { fundingYears } from '@/lib/funding';
import { z } from 'zod';
const headers = { 'Cache-Control': 'private, no-store' };
const decision = z
  .object({
    id: z.string().max(240),
    reason: z.string().trim().min(30).max(3000),
    decision: z
      .object({
        classification: z.enum(['included', 'excluded', 'mixed_unresolved', 'awaiting_review']),
        action: z.enum(['save', 'publish', 'withdraw']),
        confirmed: z.literal(true),
        sourceChecked: z.boolean(),
        unitsChecked: z.boolean(),
        jurisdictionChecked: z.boolean(),
        scopeChecked: z.boolean(),
        editionsChecked: z.boolean(),
      })
      .strict(),
  })
  .strict();
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'Verified owner MFA required' }, { status: 401, headers });
  }
  const p = new URL(request.url).searchParams,
    year = p.get('year') ?? '2026-2027';
  if (!fundingYears.includes(year) || !/^\d{1,6}$/.test(p.get('offset') ?? '0'))
    return Response.json({ error: 'Invalid review filters' }, { status: 400, headers });
  try {
    const { data, error } = await admin.client.rpc('admin_funding', {
      p_year: year,
      p_offset: Number(p.get('offset') ?? 0),
      p_query: (p.get('q') ?? '').slice(0, 200),
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      { error: 'Private funding queue unavailable. No publication decision was made.' },
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
    return Response.json({ error: 'Verified owner MFA required' }, { status: 401, headers });
  }
  try {
    const value = decision.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
    );
    const { error } = await admin.client.rpc('review_funding', {
      p_id: value.id,
      p_decision: value.decision,
      p_reason: value.reason,
    });
    if (error) throw new Error(error.message);
    return Response.json({ saved: true }, { headers });
  } catch (e) {
    return Response.json(
      { error: e instanceof z.ZodError ? 'Complete the documented review.' : (e as Error).message },
      { status: 400, headers },
    );
  }
}
