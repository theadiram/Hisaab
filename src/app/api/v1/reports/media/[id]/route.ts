import { cookies } from 'next/headers';
import { hashToken, readReport, reportClient } from '@/lib/reports';
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token)
    return Response.json({ error: 'Private case access required' }, { status: 401, headers });
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id))
    return Response.json({ error: 'Photograph unavailable' }, { status: 404, headers });
  try {
    if (!(await readReport(token)))
      return Response.json({ error: 'Private case access required' }, { status: 401, headers });
    const client = reportClient();
    const result = await client.rpc('list_case_media', { p_hash: hashToken(token) });
    if (result.error) throw new Error();
    const photo = (result.data ?? []).find(
      (m: { id: string; state: string }) => m.id === id && m.state === 'private_validated',
    );
    if (!photo?.derivative_path)
      return Response.json({ error: 'Photograph unavailable' }, { status: 404, headers });
    const { data, error } = await client.storage
      .from('case-derivatives')
      .download(photo.derivative_path);
    if (error || !data) throw new Error();
    return new Response(await data.arrayBuffer(), {
      headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Disposition': 'inline' },
    });
  } catch {
    return Response.json(
      { error: 'Private photograph storage unavailable' },
      { status: 503, headers },
    );
  }
}
