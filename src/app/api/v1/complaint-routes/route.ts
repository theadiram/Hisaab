import { publicDb } from '@/lib/public-db';
export async function GET() {
  try {
    const r = await publicDb().from('complaint_routes').select('*').order('name');
    if (r.error) throw r.error;
    return Response.json({ routes: r.data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Verified complaint routes unavailable' }, { status: 503 });
  }
}
