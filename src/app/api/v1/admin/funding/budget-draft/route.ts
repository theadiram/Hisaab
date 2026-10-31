import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
const headers = { 'Cache-Control': 'private, no-store' };
const input = z
  .object({
    rowId: z.string().min(1).max(120),
    parserVersion: z.string().min(1).max(60),
    column: z.number().int().min(0).max(3),
    reason: z.string().trim().min(30).max(2000),
    metadata: z
      .object({
        programmeId: z.string().trim().min(1).max(200),
        programme: z.string().trim().min(1).max(400),
        budgetHead: z.string().trim().min(1).max(240),
        ministry: z.string().trim().min(1).max(240),
        channel: z.enum([
          'central_sector',
          'centrally_sponsored',
          'development_grant',
          'capital_loan',
          'finance_commission',
          'disaster_grant',
          'other',
        ]),
        instrument: z.enum(['grant', 'loan', 'direct_expenditure', 'unresolved']),
        coverageKey: z.string().trim().min(1).max(240),
        parentKey: z.string().max(240).nullable(),
        aggregation: z.enum(['leaf', 'context']),
        cutoff: z.iso.date(),
        publicationDate: z.iso.date().nullable(),
        confirmed: z.literal(true),
      })
      .strict(),
  })
  .strict();
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'Verified owner MFA required' }, { status: 401, headers });
  }
  let parsed;
  try {
    parsed = input.parse(JSON.parse(new TextDecoder().decode(await boundedBody(request, 16000))));
  } catch {
    return Response.json(
      { error: 'Explicit programme, fiscal-column and hierarchy interpretation required' },
      { status: 400, headers },
    );
  }
  const { data, error } = await admin.client.rpc('draft_budget_funding', {
    p_row_id: parsed.rowId,
    p_parser_version: parsed.parserVersion,
    p_column: parsed.column,
    p_metadata: parsed.metadata,
    p_reason: parsed.reason,
  });
  if (error)
    return Response.json(
      {
        error:
          'Budget draft rejected. Check the row classification, fiscal scope, source cutoff and original evidence.',
      },
      { status: 400, headers },
    );
  return Response.json({ id: data, publication: false, review: 'private_pending' }, { headers });
}
