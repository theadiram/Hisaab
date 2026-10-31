import { requireAdmin } from '@/lib/admin';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  try {
    const { client } = await requireAdmin();
    const result = await client.rpc('admin_publications');
    if (result.error) throw result.error;
    return Response.json({ publications: result.data }, { headers });
  } catch {
    return Response.json({ error: 'MFA administrator required' }, { status: 401, headers });
  }
}
