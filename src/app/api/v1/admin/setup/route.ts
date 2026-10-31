import { boundedBody } from '@/lib/request-body';
import { reportClient } from '@/lib/reports';
import { isLocalHost, requireOrigin, equalSecret } from '@/lib/security';
import { z } from 'zod';
const input = z.object({
  email: z.email(),
  password: z.string().min(14).max(128),
  setupSecret: z.string().min(32),
});
export async function POST(request: Request) {
  if (
    process.env.NODE_ENV === 'production' ||
    !isLocalHost(new URL(request.url).host) ||
    !requireOrigin(request)
  )
    return Response.json(
      { error: 'First-owner setup is only available from the local preview' },
      { status: 403 },
    );
  try {
    const body = input.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 12000))),
    );
    if (
      !process.env.HISAAB_ADMIN_TOKEN ||
      !equalSecret(body.setupSecret, process.env.HISAAB_ADMIN_TOKEN)
    )
      throw new Error('Setup authorization required');
    const client = reportClient();
    const users = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (users.error || users.data.users.length)
      throw new Error('An account already exists. Use administrator recovery instead of setup.');
    const created = await client.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error('Owner account could not be created');
    const grant = await client.rpc('bootstrap_first_admin', { p_user: created.data.user.id });
    if (grant.error)
      throw new Error('Account created but membership setup failed. Use administrator recovery.');
    return Response.json({ created: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
