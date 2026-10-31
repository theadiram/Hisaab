import { operatingLimit } from '@/lib/operating-limits';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireOrigin } from '@/lib/security';
import { storePhoto } from '@/lib/media';
import { hashToken, readReport, reportClient } from '@/lib/reports';
import { boundedBody, BodyLimitError } from '@/lib/request-body';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return NextResponse.json({ error: 'Request origin rejected' }, { status: 403, headers });
  if (!(await operatingLimit(request, 'media-upload', 20)))
    return NextResponse.json(
      { error: 'Please wait before uploading again' },
      { status: 429, headers },
    );
  const token =
    request.headers.get('X-Hisaab-Capability') || (await cookies()).get('hisaab_case')?.value;
  if (!token)
    return NextResponse.json({ error: 'Private case access required' }, { status: 401, headers });
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024)
    return NextResponse.json({ error: 'Upload too large' }, { status: 413, headers });
  try {
    const bytes = await boundedBody(request, 11 * 1024 * 1024);
    const form = await new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
      body: bytes,
    }).formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
      return NextResponse.json(
        { error: 'Select a photograph no larger than 10 MB' },
        { status: 400, headers },
      );
    return NextResponse.json(await storePhoto(token, Buffer.from(await file.arrayBuffer())), {
      status: 201,
      headers,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Photograph rejected' },
      { status: e instanceof BodyLimitError ? 413 : 400, headers },
    );
  }
}
export async function GET() {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token || !(await readReport(token)))
    return NextResponse.json({ error: 'Private case access required' }, { status: 401, headers });
  const { data, error } = await reportClient().rpc('list_case_media', { p_hash: hashToken(token) });
  if (error) return NextResponse.json({ error: 'Media unavailable' }, { status: 503, headers });
  return NextResponse.json(
    {
      media: (data ?? []).map((m: { id: string; original_sha256: string; state: string }) => ({
        id: m.id,
        sha256: m.original_sha256,
        state: m.state,
        public: false,
      })),
    },
    { headers },
  );
}
