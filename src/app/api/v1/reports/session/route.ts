import { boundedBody } from '@/lib/request-body';
import { operatingLimit } from '@/lib/operating-limits';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { readReport, deleteReport } from '@/lib/reports';
import { requireOrigin } from '@/lib/security';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET() {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token)
    return NextResponse.json({ error: 'Private session required' }, { status: 401, headers });
  try {
    const report = await readReport(token);
    if (!report)
      return NextResponse.json(
        { error: 'Private session expired or revoked' },
        { status: 404, headers },
      );
    const { tokenHash, ...safe } = report;
    return NextResponse.json({ report: safe }, { headers });
  } catch {
    return NextResponse.json(
      { error: 'Private case storage unavailable' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return NextResponse.json({ error: 'Request origin rejected' }, { status: 403, headers });
  if (!(await operatingLimit(request, 'report-session', 60)))
    return NextResponse.json(
      { error: 'Please wait before trying again' },
      { status: 429, headers },
    );
  try {
    const body = new TextDecoder().decode(await boundedBody(request, 300));
    if (body.length > 300)
      return NextResponse.json({ error: 'Invalid private link' }, { status: 400, headers });
    const { token } = JSON.parse(body);
    if (typeof token !== 'string') throw new Error();
    const report = await readReport(token);
    if (!report)
      return NextResponse.json(
        { error: 'Private link is invalid or has been revoked' },
        { status: 404, headers },
      );
    const { tokenHash, ...safe } = report;
    const response = NextResponse.json({ report: safe }, { headers });
    response.cookies.set('hisaab_case', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/reports',
      maxAge: 1800,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Unable to open this private report' },
      { status: 400, headers },
    );
  }
}
export async function DELETE(request: Request) {
  if (!requireOrigin(request))
    return NextResponse.json({ error: 'Request origin rejected' }, { status: 403, headers });
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token)
    return NextResponse.json({ error: 'Private session required' }, { status: 401, headers });
  try {
    const deleted = await deleteReport(token);
    const response = NextResponse.json({ deleted }, { status: deleted ? 200 : 404, headers });
    response.cookies.set('hisaab_case', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/reports',
      maxAge: 0,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Deletion unavailable' }, { status: 503, headers });
  }
}
