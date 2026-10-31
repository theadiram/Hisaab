import { boundedBody } from '@/lib/request-body';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { readReport, reportClient, hashToken, encryptedJson, decryptedJson } from '@/lib/reports';
import { requireOrigin } from '@/lib/security';
const headers = { 'Cache-Control': 'private, no-store' };
const schema = z.object({
  type: z.enum([
    'citizen_reported_submission',
    'authority_response',
    'citizen_accepted',
    'reopened',
  ]),
  description: z.string().min(10).max(5000),
  date: z.iso.date().refine((v) => new Date(v) <= new Date()),
  reference: z.string().max(200).default(''),
});
async function caseToken() {
  const token = (await cookies()).get('hisaab_case')?.value;
  if (!token || !(await readReport(token))) throw new Error('Active private case required');
  return token;
}
export async function GET() {
  try {
    const token = await caseToken();
    const result = await reportClient().rpc('list_private_case_events', {
      p_hash: hashToken(token),
    });
    if (result.error) throw result.error;
    const events = await Promise.all(
      result.data.map(
        async (e: {
          id: string;
          type: string;
          payload: { blob: string };
          createdAt: string;
          verifiedBy?: string | null;
        }) => ({
          id: e.id,
          type: e.type,
          createdAt: e.createdAt,
          ...(await decryptedJson(e.payload)),
          verification: e.verifiedBy ? 'owner_reviewed_document' : 'citizen_provided_unverified',
        }),
      ),
    );
    return Response.json({ events }, { headers });
  } catch {
    return Response.json({ error: 'Private case session required' }, { status: 401, headers });
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let token;
  try {
    token = await caseToken();
  } catch {
    return Response.json({ error: 'Private case session required' }, { status: 401, headers });
  }
  try {
    const value = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
    );
    const result = await reportClient().rpc('append_private_case_event', {
      p_hash: hashToken(token),
      p_type: value.type,
      p_payload: await encryptedJson(value),
    });
    if (result.error) throw result.error;
    return Response.json(
      { id: result.data, verification: 'citizen_provided_unverified' },
      { status: 201, headers },
    );
  } catch {
    return Response.json(
      { error: 'Update could not be saved. Check the date and description.' },
      { status: 400, headers },
    );
  }
}
