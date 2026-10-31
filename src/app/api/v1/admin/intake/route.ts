import { createHash } from 'node:crypto';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { validateIntake } from '@/lib/intake-contract';
import { reportClient } from '@/lib/reports';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA owner access required' }, { status: 401, headers });
  }
  const id = new URL(request.url).searchParams.get('id');
  const result = await admin.client.rpc('admin_atlas_batches', { p_id: id });
  return result.error
    ? Response.json({ error: 'Private intake queue is unavailable' }, { status: 503, headers })
    : Response.json(id ? { batch: result.data } : { batches: result.data }, { headers });
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json({ error: 'Same-origin request required' }, { status: 403, headers });
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json({ error: 'MFA owner access required' }, { status: 401, headers });
  }
  try {
    const raw = await boundedBody(request, 2 * 1024 * 1024),
      validated = validateIntake(JSON.parse(new TextDecoder().decode(raw))),
      p = validated.package,
      storage = reportClient();
    for (const source of p.sources) {
      const original = await storage.storage.from('source-originals').download(source.storagePath);
      if (original.error || !original.data || original.data.size > 10 * 1024 * 1024)
        throw new Error('Preserved original is missing or exceeds the pilot limit');
      const bytes = Buffer.from(await original.data.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== source.hash)
        throw new Error('Preserved original checksum mismatch');
      const registered = await admin.client.rpc('register_atlas_original', { p_source: source });
      if (registered.error)
        throw new Error(
          'Private original registration failed: ' + String(registered.error.message).slice(0, 500),
        );
    }
    const sha = createHash('sha256').update(JSON.stringify(p)).digest('hex'),
      result = await admin.client.rpc('stage_atlas_batch', { p_payload: p, p_sha: sha });
    if (result.error)
      throw new Error(
        'Private package staging failed: ' + String(result.error.message).slice(0, 500),
      );
    return Response.json({ ...result.data, ...validated.summary }, { status: 201, headers });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Intake validation failed' },
      { status: 400, headers },
    );
  }
}
