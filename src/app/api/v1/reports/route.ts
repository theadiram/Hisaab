import { operatingLimit } from '@/lib/operating-limits';
import { NextResponse } from 'next/server';
import { reportInput, saveReport } from '@/lib/reports';
import { requireOrigin } from '@/lib/security';
import { readPublishedWork } from '@/lib/catalogue';
const headers = { 'Cache-Control': 'private, no-store' };
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return NextResponse.json({ error: 'Request origin rejected' }, { status: 403, headers });
  if (!(await operatingLimit(request, 'report-create', 20)))
    return NextResponse.json(
      { error: 'Please wait before creating another report' },
      { status: 429, headers },
    );
  try {
    const body = await request.text();
    if (body.length > 12000)
      return NextResponse.json({ error: 'Request too large' }, { status: 413, headers });
    const input = reportInput.safeParse(JSON.parse(body));
    if (!input.success)
      return NextResponse.json(
        { error: 'Check the observation, date and privacy consent' },
        { status: 400, headers },
      );
    if (input.data.workId && !input.data.demo) {
      if (!(await readPublishedWork(input.data.workId)))
        return NextResponse.json(
          { error: 'The selected work is not in the published catalogue' },
          { status: 400, headers },
        );
    }
    if (input.data.demo && process.env.NODE_ENV === 'production')
      return NextResponse.json(
        { error: 'Demonstration reports cannot be saved in production' },
        { status: 400, headers },
      );
    const { report, token } = await saveReport(input.data);
    const origin = new URL(process.env.HISAAB_APP_ORIGIN || request.url).origin;
    return NextResponse.json(
      { reference: report.reference, trackingUrl: `${origin}/#track=${token}` },
      { status: 201, headers },
    );
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error && e.message.startsWith('Private case')
            ? e.message
            : 'Unable to save the observation securely',
      },
      { status: 503, headers },
    );
  }
}
