import { developmentSelection } from '@/lib/development';
import { fundingStates } from '@/lib/funding';
import { readDevelopment } from '@/lib/development-db';
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (code !== 'national' && !fundingStates.some((s) => s.code === code))
    return Response.json({ error: 'Unknown jurisdiction' }, { status: 400 });
  let selection;
  try {
    selection = developmentSelection(new URL(request.url).searchParams);
  } catch {
    return Response.json({ error: 'Invalid development filters' }, { status: 400 });
  }
  try {
    const data = await readDevelopment(selection);
    return Response.json(
      {
        selection,
        area: code === 'national' ? data.national : data.states.find((s) => s.code === code),
        coverage: data.coverage,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Reviewed area evidence is unavailable', complete: false },
      { status: 503 },
    );
  }
}
