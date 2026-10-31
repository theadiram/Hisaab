import { publicDb } from '@/lib/public-db';
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get('q') || '').trim();
  if (query.length < 2) return Response.json({ areas: [] });
  if (query.length > 100) return Response.json({ error: 'Search is too long' }, { status: 400 });
  if (
    !process.env.HISAAB_CATALOGUE_API_URL &&
    (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
  )
    return Response.json({ areas: [], coverage: 'Registry not configured' });
  const client = publicDb();
  const { data, error } = await client
    .from('areas')
    .select('id,code,name,kind,parent_id')
    .ilike('name', `%${query.replace(/[%_\\]/g, '')}%`)
    .limit(20);
  if (error) return Response.json({ error: 'Registry search unavailable' }, { status: 503 });
  return Response.json({ areas: data, coverage: 'Approved imported administrative registry only' });
}
