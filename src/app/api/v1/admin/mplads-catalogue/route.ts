import { requireAdmin } from '@/lib/admin';
import { catalogue } from '@/lib/mplads-catalogue';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return Response.json(
      { error: 'Owner MFA sign-in required to inspect nationwide source records.' },
      { status: 401, headers },
    );
  }
  const params = new URL(request.url).searchParams,
    q = (params.get('q') ?? '').trim(),
    state = params.get('state') ?? '',
    house = params.get('house') ?? '',
    page = params.get('page') ?? '1',
    project = params.get('project');
  if (
    q.length > 100 ||
    state.length > 80 ||
    !['', '1', '2'].includes(house) ||
    !/^\d{1,6}$/.test(page) ||
    Number(page) < 1 ||
    (project !== null && (project.length > 160 || !/^[12]:WS\//.test(project)))
  )
    return Response.json({ error: 'Invalid catalogue filter or page.' }, { status: 400, headers });
  try {
    const data = catalogue(q, state, house, Number(page), project);
    return data
      ? Response.json(data, { headers })
      : Response.json({ error: 'Project not found' }, { status: 404, headers });
  } catch {
    return Response.json(
      { error: 'Private source catalogue unavailable. No payment or publication status changed.' },
      { status: 503, headers },
    );
  }
}
