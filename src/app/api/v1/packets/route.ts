import { z } from 'zod';
import { boundedBody } from '@/lib/request-body';
import { requireOrigin } from '@/lib/security';
import { operatingLimit } from '@/lib/operating-limits';
import { packetPdf } from '@/lib/packet-pdf';
const schema = z.object({
  draft: z.string().min(20).max(20000),
  kind: z.enum(['complaint', 'rti']),
  demo: z.boolean().default(true),
});
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403 });
  if (!(await operatingLimit(request, 'packet-export', 10)))
    return Response.json({ error: 'Please try again later' }, { status: 429 });
  try {
    const value = schema.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 85000))),
    );
    return new Response(new Uint8Array(await packetPdf(value.draft, value.kind, value.demo)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="hisaab-${value.kind}-draft.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
