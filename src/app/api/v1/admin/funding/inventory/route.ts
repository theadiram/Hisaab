import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { fundingYears, fundingPurposes } from '@/lib/funding';
import { z } from 'zod';
const headers = { 'Cache-Control': 'private, no-store' };
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
    return Response.json({ error: 'Invalid inventory filters' }, { status: 400, headers });
  try {
    const { data, error } = await admin.client.rpc('admin_funding_inventory', {
      p_year: year,
      p_offset: Number(p.get('offset') ?? 0),
      p_query: (p.get('q') ?? '').slice(0, 200),
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch {
    return Response.json({ error: 'Private inventory unavailable' }, { status: 503, headers });
  }
}
const input = z
  .object({
    id: z.string().max(240),
    classification: z.enum(['included', 'excluded', 'mixed_unresolved', 'awaiting_review']),
    purpose: z.enum(Object.keys(fundingPurposes) as [string, ...string[]]),
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
      result = await admin.client.rpc('review_funding_inventory', {
        p_id: r.id,
        p_classification: r.classification,
        p_purpose: r.purpose,
        p_reason: r.reason,
      });
    if (result.error) throw result.error;
    return Response.json({ saved: true, publication: false }, { headers });
  } catch {
    return Response.json(
      { error: 'A documented inventory classification is required' },
      { status: 400, headers },
    );
  }
}
