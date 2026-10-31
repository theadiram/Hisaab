import { boundedBody } from '@/lib/request-body';
import { requireAdmin } from '@/lib/admin';
import { decryptedJson } from '@/lib/reports';
import { requireOrigin } from '@/lib/security';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  try {
    const { client } = await requireAdmin();
    const result = await client.rpc('admin_corrections');
    if (result.error) throw result.error;
    const corrections = await Promise.all(
      result.data.map(async (c: { id: string; field: string; payload: { blob: string } }) => ({
        ...c,
        payload: undefined,
        ...(await decryptedJson(c.payload)),
      })),
    );
    return Response.json({ corrections }, { headers });
  } catch {
    return Response.json({ error: 'MFA administrator required' }, { status: 401, headers });
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA administrator required' }, { status: 401, headers });
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000)));
    const result = await admin.client.rpc('review_correction', {
      p_id: value.id,
      p_decision: value.decision,
      p_reason: value.reason,
    });
    if (result.error) throw result.error;
    return Response.json({ reviewed: true }, { headers });
  } catch {
    return Response.json(
      { error: 'Documented correction decision required' },
      { status: 400, headers },
    );
  }
}
