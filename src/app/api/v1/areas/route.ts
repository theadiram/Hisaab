import { publicDb } from '@/lib/public-db';
import { fundingStates } from '@/lib/funding';
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams,
    state = p.get('state'),
    parent = p.get('parent');
  if (
    (!state && !parent) ||
    (state && !fundingStates.some((s) => s.code === state)) ||
    (parent && parent.length > 160)
  )
    return Response.json({ error: 'Choose a verified parent area' }, { status: 400 });
  try {
    const client = publicDb();
    let parentId = parent;
    if (state && !parent) {
      const r = await client
        .from('areas')
        .select('id')
        .eq('kind', 'state')
        .eq('code', state)
        .eq('approved', true)
        .maybeSingle();
      if (r.error) throw r.error;
      parentId = r.data?.id ?? null;
    }
    if (!parentId)
      return Response.json({ areas: [], coverage: 'No reviewed area registry is available' });
    const r = await client
      .from('areas')
      .select('id,code,name,kind,parent_id')
      .eq('parent_id', parentId)
      .eq('approved', true)
      .order('name')
      .limit(1000);
    if (r.error) throw r.error;
    return Response.json({
      areas: r.data,
      parent: parentId,
      coverage: 'Reviewed administrative identities; project locations require separate evidence',
    });
  } catch {
    return Response.json({ error: 'Area registry unavailable' }, { status: 503 });
  }
}
