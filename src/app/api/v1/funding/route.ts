import { fundingOverview, fundingSelection } from '@/lib/funding';
import { publishedFunding } from '@/lib/funding-db';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  let selection;
  try {
    selection = fundingSelection(new URL(request.url).searchParams);
  } catch {
    return Response.json({ error: 'Invalid funding filters' }, { status: 400, headers });
  }
  try {
    return Response.json(fundingOverview(await publishedFunding(selection), selection), {
      headers,
    });
  } catch {
    return Response.json(
      {
        error: 'Reviewed funding service is unavailable. No zero amount has been substituted.',
        scope: 'Union development funding',
        complete: false,
      },
      { status: 503, headers },
    );
  }
}
