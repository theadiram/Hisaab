import { fundingSelection, fundingStates } from '@/lib/funding';
import { publishedFundingHistory } from '@/lib/funding-db';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const p = new URL(request.url).searchParams,
    scope = p.get('scope') ?? 'national';
  if (
    !id ||
    id.length > 200 ||
    p.getAll('scope').length > 1 ||
    (scope !== 'national' &&
      !fundingStates.some((s) => s.code === scope) &&
      !/^historical:[a-z0-9_-]{1,100}$/.test(scope))
  )
    return Response.json({ error: 'Invalid programme or funding scope' }, { status: 400, headers });
  p.delete('scope');
  try {
    fundingSelection(p);
  } catch {
    return Response.json({ error: 'Invalid funding filters' }, { status: 400, headers });
  }
  try {
    return Response.json(
      {
        programmeId: id,
        jurisdiction: scope,
        scope: 'Union development funding',
        history: await publishedFundingHistory(scope, id),
        complete: false,
        accountingNote:
          'History contains separate fiscal years, original/revised alternatives and funding stages; do not add them together.',
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'Programme funding history unavailable' },
      { status: 503, headers },
    );
  }
}
