import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { decryptedJson, reportClient } from '@/lib/reports';
import type { ComplaintPacket } from '@/lib/complaints';
const headers = { 'Cache-Control': 'private, no-store' },
  schema = z
    .object({
      id: z.uuid(),
      action: z.enum(['ready', 'decline', 'send']),
      reason: z.string().min(30).max(2000),
      confirmed: z.literal(true),
    })
    .strict();
export async function GET() {
  try {
    const admin = await requireAdmin(),
      r = await admin.client.rpc('admin_complaints');
    if (r.error) throw r.error;
    const packets = await Promise.all(
      (r.data ?? []).map(async (p: { payload: { blob: string } }) => ({
        ...p,
        payload: await decryptedJson(p.payload),
      })),
    );
    return Response.json(
      {
        packets,
        emailConfigured:
          process.env.HISAAB_EMAIL_ENABLED === 'true' &&
          !!process.env.RESEND_API_KEY &&
          !!process.env.HISAAB_REPORT_FROM,
      },
      { headers },
    );
  } catch {
    return Response.json({ error: 'Live MFA owner access required' }, { status: 401, headers });
  }
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'Live MFA owner access required' }, { status: 401, headers });
  }
  try {
    const input = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 5000))),
    );
    if (
      input.action === 'send' &&
      (process.env.HISAAB_EMAIL_ENABLED !== 'true' ||
        !process.env.RESEND_API_KEY ||
        !process.env.HISAAB_REPORT_FROM)
    )
      throw new Error('Dedicated Hisaab sending domain is not configured');
    const r = await admin.client.rpc('review_complaint', {
      p_id: input.id,
      p_action: input.action,
      p_reason: input.reason,
    });
    if (r.error) throw r.error;
    if (input.action !== 'send')
      return Response.json(
        { status: input.action === 'ready' ? 'ready' : 'declined', filed: false },
        { headers },
      );
    const client = reportClient();
    let status = 'ambiguous',
      providerId: string | null = null;
    try {
      const p = (await decryptedJson(r.data.payload)) as ComplaintPacket;
      const route = await client
        .from('complaint_routes')
        .select('*')
        .eq('id', r.data.route)
        .eq('approved', true)
        .maybeSingle();
      if (
        route.error ||
        route.data?.channel !== 'email' ||
        route.data.destination !== p.route.destination ||
        !p.delegationConsent ||
        !p.replyTo
      )
        throw new Error('Filing channel or citizen consent changed');
      const sent = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'hisaab-complaint/' + input.id,
        },
        body: JSON.stringify({
          from: process.env.HISAAB_REPORT_FROM,
          to: [route.data.destination],
          reply_to: p.replyTo,
          subject: 'Request for inspection and response · ' + p.reference,
          text:
            p.draft +
            '\n\nPrepared with the citizen’s consent through Hisaab. This email requests acknowledgement; it does not assert registration or proven misconduct.',
        }),
      });
      const data = await sent.json();
      if (sent.ok && typeof data.id === 'string') {
        status = 'sent';
        providerId = data.id;
      } else if (sent.status >= 400 && sent.status < 500) status = 'failed';
    } finally {
      const finished = await client.rpc('finish_complaint', {
        p_id: input.id,
        p_status: status,
        p_provider: providerId,
      });
      if (finished.error)
        throw new Error('Transport result could not be recorded; do not resend until reconciled');
    }
    return Response.json({ status, providerId, filed: false }, { headers });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
