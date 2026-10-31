import { requireAdmin } from '@/lib/admin';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Verified administrator sign-in required' },
      { status: 401, headers },
    );
  }
  const params = new URL(request.url).searchParams;
  try {
    const { data, error } = await admin.client.rpc('admin_budget_context', {
      p_offset: Math.trunc(Math.max(0, Math.min(102, Number(params.get('offset')) || 0))),
      p_query: (params.get('q') || '').slice(0, 200),
    });
    if (error) throw error;
    return Response.json(data, { headers });
  } catch {
    return Response.json(
      { error: 'Budget review records temporarily unavailable' },
      { status: 503, headers },
    );
  }
}
