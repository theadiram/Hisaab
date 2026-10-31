import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { requireOrigin } from '@/lib/security';
import { boundedBody } from '@/lib/request-body';
import { workSchema } from '@/lib/validation';
import { pendingCandidateSchema } from '@/lib/pending-candidate';
import { assertPublicationEvidence } from '@/lib/publication-evidence';
import type { Work } from '@/lib/model';
const headers = { 'Cache-Control': 'private, no-store' };
const base = { reason: z.string().min(20).max(4000), confirmed: z.literal(true) };
const input = z.discriminatedUnion('action', [
  z
    .object({
      ...base,
      action: z.literal('rights'),
      documents: z
        .array(
          z
            .object({
              id: z.uuid(),
              sourceId: z.string().min(1).max(100),
              hash: z.string().regex(/^[a-f0-9]{64}$/),
              url: z.url().max(2048),
              basis: z.string().min(30).max(2000),
              evidence: z.string().min(20).max(2000),
            })
            .strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('reconcile'),
      records: z
        .array(z.object({ expected: pendingCandidateSchema, work: workSchema }).strict())
        .min(1)
        .max(25),
    })
    .strict(),
  z
    .object({
      ...base,
      action: z.literal('publish'),
      records: z
        .array(z.object({ expected: workSchema }).strict())
        .min(1)
        .max(25),
    })
    .strict(),
]);
/** Compare schema-normalized snapshots without depending on PostgreSQL JSONB key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
function narrowReviewedRoad(work: Work) {
  if (
    work.purpose !== 'Roads' ||
    work.demo ||
    work.money.length ||
    !work.location ||
    work.locationPrecision !== 'source_point' ||
    !work.physicalVerification.includes('not independently verified') ||
    work.authority !== null ||
    work.authorityReceipt !== null ||
    work.roles?.length ||
    work.media?.length
  )
    throw new Error(
      'Only unverified source-point road records without money, parties or media are permitted.',
    );
  for (const stage of work.stages) {
    if (stage.amount !== null) throw new Error('Road preview cannot approve an amount.');
    if (['sanction', 'award'].includes(stage.id)) {
      if (
        stage.state !== 'found' ||
        stage.reviewStatus !== 'verified' ||
        !stage.date ||
        !stage.receipts.length
      )
        throw new Error('Both reported dates require explicit verified source evidence.');
    } else if (
      stage.state !== 'inaccessible' ||
      stage.reviewStatus !== 'pending' ||
      stage.date !== null ||
      stage.receipts.length ||
      stage.completionBasis
    )
      throw new Error('Payment and completion must remain inaccessible, pending and empty.');
  }
  assertPublicationEvidence(work);
}
export async function POST(request: Request) {
  if (!requireOrigin(request))
    return Response.json(
      { error: 'Same-origin request required', checkpoints: [] },
      { status: 403, headers },
    );
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return Response.json(
      { error: 'MFA administrator access required', checkpoints: [] },
      { status: 401, headers },
    );
  }
  const checkpoints: {
    id: string;
    action: 'reconcile' | 'publish';
    work: Work;
    version?: unknown;
  }[] = [];
  const rightsCheckpoints: string[] = [];
  let failedId: string | undefined;
  try {
    const body = input.parse(
      JSON.parse(new TextDecoder().decode(await boundedBody(request, 400000))),
    );
    if (body.action === 'rights') {
      if (new Set(body.documents.map((d) => d.id)).size !== body.documents.length)
        throw new Error('Repeated source-document identity in rights batch.');
      for (const doc of body.documents) {
        const match = await admin.client.rpc('admin_source_document_by_identity', {
          p_source_id: doc.sourceId,
          p_hash: doc.hash,
          p_url: doc.url,
        });
        if (
          match.error ||
          !match.data ||
          match.data.id !== doc.id ||
          match.data.sourceId !== doc.sourceId ||
          match.data.hash !== doc.hash ||
          match.data.url !== doc.url
        )
          throw new Error('Source identity changed; inspect the exact original again.');
        const saved = await admin.client.rpc('verify_source_permission', {
          p_document: doc.id,
          p_basis: doc.basis,
          p_evidence: doc.evidence,
        });
        if (saved.error) throw new Error(saved.error.message);
        rightsCheckpoints.push(doc.id);
      }
      return Response.json({ complete: true, rightsCheckpoints }, { headers });
    }
    const ids = body.records.map((r) => r.expected.id);
    if (new Set(ids).size !== ids.length) throw new Error('Repeated candidate identity in batch.');
    // Preflight every desired scope before any mutation; snapshots are checked again immediately before each write.
    for (const row of body.records) {
      const desired = 'work' in row ? row.work : row.expected;
      narrowReviewedRoad(desired);
      if (
        desired.id !== row.expected.id ||
        canonical(desired.officialIds) !== canonical(row.expected.officialIds)
      )
        throw new Error('Official work identity must remain unchanged.');
    }
    for (const row of body.records) {
      failedId = row.expected.id;
      const result = await admin.client.rpc('admin_candidate', { p_id: failedId });
      if (result.error) throw new Error(result.error.message);
      if (!result.data)
        throw new Error(
          'Exact pending candidate is unavailable; inspect its publication history before retrying.',
        );
      const current = pendingCandidateSchema.parse(result.data);
      if (current.id !== failedId || canonical(current) !== canonical(row.expected))
        throw new Error(
          'Candidate changed since inspection. Stop and inspect again before deciding.',
        );
      if (body.action === 'reconcile' && 'work' in row) {
        if (
          current.money.length ||
          current.stages.some((s) => s.state === 'found' || s.reviewStatus === 'verified')
        )
          throw new Error(
            'Already reviewed evidence is held unchanged; use the main owner console.',
          );
        const saved = await admin.client.rpc('reconcile_candidate', {
          p_id: failedId,
          p_payload: row.work,
          p_reason: body.reason,
        });
        if (saved.error) throw new Error(saved.error.message);
        const readback = await admin.client.rpc('admin_candidate', { p_id: failedId });
        if (readback.error) throw new Error(readback.error.message);
        const confirmed = workSchema.parse(readback.data);
        if (canonical(confirmed) !== canonical(row.work))
          throw new Error(
            'Reconciliation was submitted but its read-back did not match. Inspect this exact record before retrying.',
          );
        checkpoints.push({ id: failedId, action: 'reconcile', work: confirmed });
      } else {
        const work = workSchema.parse(current);
        narrowReviewedRoad(work);
        const published = await admin.client.rpc('publish_reviewed_candidate', {
          p_id: failedId,
          p_payload: work,
          p_reason: body.reason,
        });
        if (published.error) throw new Error(published.error.message);
        checkpoints.push({ id: failedId, action: 'publish', work, version: published.data });
      }
    }
    return Response.json({ complete: true, checkpoints }, { headers });
  } catch (error) {
    return Response.json(
      {
        complete: false,
        checkpoints,
        rightsCheckpoints,
        failedId,
        error:
          error instanceof Error ? error.message : 'Road review stopped. Inspect before retrying.',
      },
      { status: 400, headers },
    );
  }
}
