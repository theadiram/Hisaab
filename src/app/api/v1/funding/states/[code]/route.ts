import { fundingOverview, fundingSelection, fundingStates, selectedFunding } from '@/lib/funding';
import { publishedFunding, publishedFundingHistory } from '@/lib/funding-db';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  const state = fundingStates.find((s) => s.code === code);
  if (!state) return Response.json({ error: 'Unknown state or UT' }, { status: 400, headers });
  const params = new URL(request.url).searchParams;
  let selection;
  try {
    selection = fundingSelection(params);
  } catch {
    return Response.json({ error: 'Invalid funding filters' }, { status: 400, headers });
  }
  try {
    const all = await publishedFunding(selection),
      overview = fundingOverview(all, selection),
      offset = Number(params.get('offset') ?? 0),
      programme = params.get('programme');
    const rs = selectedFunding(all, selection)
      .records.filter((r) => r.jurisdiction === code && (!programme || r.programmeId === programme))
      .sort((a, b) => a.programme.localeCompare(b.programme) || a.id.localeCompare(b.id));
    const history = programme ? await publishedFundingHistory(code, programme) : [];
    return Response.json(
      {
        state: overview.states.find((s) => s.code === code),
        selection,
        scope: overview.scope,
        accountingNote: overview.accountingNote,
        purposes: fundingOverview(
          all.filter((r) => r.jurisdiction === code),
          selection,
        ).purposes,
        records: rs.slice(offset, offset + 20),
        total: rs.length,
        offset,
        nextOffset: offset + 20 < rs.length ? offset + 20 : null,
        history,
        coverage: overview.coverage,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'State funding evidence is unavailable. Please retry.' },
      { status: 503, headers },
    );
  }
}
