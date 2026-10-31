import { z } from 'zod';
import { addCommand, closeRoom, createRoom, joinRoom, pollRoom } from '@/lib/content-remote-store';
import { remoteCommandSchema, remoteSessionSchema } from '@/lib/content-remote';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create') }).strict(),
  z.object({ action: z.literal('join'), code: z.string().regex(/^[A-F0-9]{10}$/i) }).strict(),
  z
    .object({
      action: z.literal('poll'),
      session: remoteSessionSchema,
      after: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      action: z.literal('command'),
      session: remoteSessionSchema,
      command: remoteCommandSchema,
    })
    .strict(),
  z.object({ action: z.literal('close'), session: remoteSessionSchema }).strict(),
]);
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.get('host');
  } catch {
    return false;
  }
}
export async function POST(request: Request) {
  if (!sameOrigin(request))
    return Response.json({ error: 'Cross-origin request blocked.' }, { status: 403 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success)
    return Response.json({ error: 'Invalid content-control request.' }, { status: 400 });
  const body = parsed.data;
  if (body.action === 'create')
    return Response.json(createRoom(), { headers: { 'Cache-Control': 'no-store' } });
  if (body.action === 'join') {
    const result = joinRoom(
      body.code,
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local',
    );
    return result
      ? Response.json({ session: result }, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json(
          { error: 'Pairing code is invalid, expired or already used.' },
          { status: 404 },
        );
  }
  if (body.action === 'poll') {
    const state = pollRoom(body.session, body.after);
    return state
      ? Response.json(state, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: 'Remote session expired.' }, { status: 410 });
  }
  if (body.action === 'command') {
    return addCommand(body.session, body.command)
      ? Response.json({ sent: true }, { headers: { 'Cache-Control': 'no-store' } })
      : Response.json({ error: 'Remote session expired.' }, { status: 410 });
  }
  return closeRoom(body.session)
    ? Response.json({ closed: true }, { headers: { 'Cache-Control': 'no-store' } })
    : Response.json({ error: 'Remote session expired.' }, { status: 410 });
}
