import { publicDb } from '@/lib/public-db';
import { readCatalogue } from '@/lib/catalogue';
import { fundingYears } from '@/lib/funding';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    p = new URL(request.url).searchParams,
    year = p.get('year') ?? '2026-2027',
    offset = Number(p.get('offset') ?? 0);
  if (
    !id ||
    id.length > 240 ||
    !fundingYears.includes(year) ||
    !Number.isInteger(offset) ||
    offset < 0 ||
    offset > 10000000
  )
    return Response.json({ error: 'Invalid party or year' }, { status: 400 });
  try {
    const firstYear = String(Number(year.slice(0, 4)) - 4),
      lastYear = year.slice(0, 4);
    if (process.env.HISAAB_DATA_MODE === 'supabase') {
      const r = await publicDb().rpc('catalogue_party_projects', {
        p_party: id,
        p_first: firstYear,
        p_last: lastYear,
        p_offset: offset,
      });
      if (r.error) throw r.error;
      return Response.json({
        ...r.data,
        scope: 'Reviewed exact party identities only; five financial years',
        complete: false,
      });
    }
    const works = (await readCatalogue()).works.filter(
      (w) =>
        w.financialYear.slice(0, 4) >= firstYear &&
        w.financialYear.slice(0, 4) <= lastYear &&
        w.roles?.some((r) => r.id === id && r.identityBasis),
    );
    return Response.json({
      works: works.slice(offset, offset + 25),
      total: works.length,
      scope: 'Reviewed exact party identities only; five financial years',
      complete: false,
    });
  } catch {
    return Response.json({ error: 'Documented party history unavailable' }, { status: 503 });
  }
}
