import { publicDb } from '@/lib/public-db';
import { publishedFundingHistory } from '@/lib/funding-db';
import { developmentSchema, legacyDevelopment } from '@/lib/development';
import { fundingStates } from '@/lib/funding';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params,
    p = new URL(request.url).searchParams,
    scope = p.get('scope');
  if (
    !scope ||
    !(
      scope === 'national' ||
      fundingStates.some((s) => s.code === scope) ||
      /^historical:[a-z0-9_-]+$/.test(scope)
    ) ||
    !id ||
    id.length > 200 ||
    [...p.keys()].some((k) => k !== 'scope') ||
    p.getAll('scope').length !== 1
  )
    return Response.json({ error: 'Invalid programme history selection' }, { status: 400 });
  try {
    const [legacy, extra] = await Promise.all([
      publishedFundingHistory(scope, id),
      publicDb().rpc('development_history', { p_scope: scope, p_programme: id }),
    ]);
    if (extra.error) throw extra.error;
    const history = [
      ...legacy.flatMap((r) =>
        legacyDevelopment([r], {
          year: r.financialYear,
          measure: r.measure,
          purpose: 'all',
          origin: 'all',
          estimate: r.estimate === 'revised' ? 'revised' : 'original',
          basis: r.accountingBasis === 'recipient_utilisation' ? 'recipient' : 'union',
        }),
      ),
      ...(extra.data ?? []).map((r: unknown) => developmentSchema.parse(r)),
    ];
    return Response.json(
      { history, complete: false },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Programme history unavailable' }, { status: 503 });
  }
}
