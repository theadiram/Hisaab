import { cookies } from 'next/headers';
import { createHash } from 'node:crypto';
import { readReport, reportClient, hashToken, encryptedJson, decryptedJson } from '@/lib/reports';
import { complaintSchema, type ComplaintPacket } from '@/lib/complaints';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { operatingLimit } from '@/lib/operating-limits';
const headers = { 'Cache-Control': 'private, no-store' };
async function session() {
  const token = (await cookies()).get('hisaab_case')?.value,
    report = token ? await readReport(token) : null;
  if (!token || !report) throw new Error('Open your private case first');
  return { token, report };
}
export async function GET() {
  try {
    const { token } = await session(),
      r = await reportClient().rpc('read_complaint', { p_hash: hashToken(token) });
    if (r.error) throw r.error;
    return Response.json(
      { packet: r.data ? { ...r.data, payload: await decryptedJson(r.data.payload) } : null },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Private complaint session required' }, { status: 401, headers });
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  if (!(await operatingLimit(request, 'prepare-complaint', 10)))
    return Response.json(
      { error: 'Please wait before preparing another packet' },
      { status: 429, headers },
    );
  try {
    const { token, report } = await session();
    if (report.demo) throw new Error('Fictional records cannot be submitted');
    const input = complaintSchema.parse(
        JSON.parse(new TextDecoder().decode(await boundedBody(request, 20000))),
      ),
      client = reportClient();
    const r = await client
      .from('complaint_routes')
      .select('*')
      .eq('id', input.routeId)
      .eq('approved', true)
      .gte('expires_at', new Date().toISOString().slice(0, 10))
      .maybeSingle();
    if (r.error || !r.data) throw new Error('This filing route is unavailable');
    if (r.data.channel === 'email' && (!input.delegationConsent || !input.replyTo))
      throw new Error('Email handoff requires a reply address and explicit citizen consent');
    const packet: ComplaintPacket = {
      ...input,
      route: r.data,
      reference: report.reference,
      preparedAt: new Date().toISOString(),
      workId: report.workId,
    };
    const result = await client.rpc('prepare_complaint', {
      p_hash: hashToken(token),
      p_route: input.routeId,
      p_payload: await encryptedJson(packet),
      p_sha: createHash('sha256').update(JSON.stringify(packet)).digest('hex'),
    });
    if (result.error) throw new Error('A packet already exists or private storage is unavailable');
    return Response.json(
      { id: result.data, status: 'prepared', filed: false },
      { status: 201, headers },
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
