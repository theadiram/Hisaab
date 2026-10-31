import { operatingLimit } from '@/lib/operating-limits';
import { boundedBody } from '@/lib/request-body';
import { z } from 'zod';
import { encryptedJson, reportClient } from '@/lib/reports';
import { requireOrigin } from '@/lib/security';
const schema = z.object({
  workId: z.string().min(1).max(160),
  field: z.string().min(1).max(100),
  reason: z.string().min(20).max(5000),
  evidenceUrl: z
    .url()
    .refine((v) => v.startsWith('https://'))
    .optional(),
  consent: z.literal(true),
});
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403 });
  if (!(await operatingLimit(request, 'corrections', 10)))
    return Response.json({ error: 'Please try again later' }, { status: 429 });
  try {
    const value = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
    );
    const result = await reportClient().rpc('submit_private_correction', {
      p_hisaab_id: value.workId,
      p_field: value.field,
      p_payload: await encryptedJson(value),
    });
    if (result.error) throw result.error;
    return Response.json(
      { reference: result.data, status: 'pending_review' },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'A published government work, supporting detail and consent are required' },
      { status: 400 },
    );
  }
}
