import { publicDb } from '@/lib/public-db';
import { readCatalogue } from '@/lib/catalogue';
import { aggregateMoney } from '@/lib/money';
import type { Measure } from '@/lib/model';
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const measure = p.get('measure') || 'payment';
  if (!['sanction', 'contract', 'payment'].includes(measure))
    return Response.json({ error: 'Invalid financial measure' }, { status: 400 });
  if (process.env.HISAAB_DATA_MODE === 'supabase') {
    const result = await publicDb().rpc('catalogue_money', {
      p_measure: measure,
      p_district: p.get('district'),
      p_year: p.get('year'),
      p_from: p.get('from'),
      p_to: p.get('to'),
    });
    if (result.error)
      return Response.json({ error: 'Financial totals unavailable' }, { status: 503 });
    return Response.json({ measure, ...result.data });
  }
  const c = await readCatalogue();
  const works = c.works.filter(
    (w) =>
      (!p.get('district') || w.district === p.get('district')) &&
      (!p.get('year') || w.financialYear === p.get('year')),
  );
  const result = aggregateMoney(
    works.flatMap((w) => w.money),
    measure as Measure,
    p.get('from') || undefined,
    p.get('to') || undefined,
  );
  return Response.json({
    measure,
    amount: result.eventCount ? result.amount : null,
    eventCount: result.eventCount,
    excluded: result.excluded,
    scope: 'Imported approved records only',
    demo: false,
  });
}
