import { routeSchema } from '@/lib/complaints';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403 });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Live MFA owner access required' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
  try {
    const input = JSON.parse(new TextDecoder().decode(await boundedBody(request, 8000))),
      route = routeSchema.parse(input.route);
    if (
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 30 ||
      route.expiresAt < new Date().toISOString().slice(0, 10)
    )
      throw new Error('Current official acceptance evidence is required');
    const r = await admin.client.rpc('review_complaint_route', {
      p_route: route,
      p_reason: input.reason,
    });
    if (r.error) throw r.error;
    return Response.json({ reviewed: true });
  } catch {
    return Response.json(
      { error: 'MFA and a documented official filing route are required' },
      { status: 400 },
    );
  }
}
