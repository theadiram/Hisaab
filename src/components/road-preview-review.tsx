'use client';
import { useState } from 'react';
import type { Work } from '@/lib/model';
import type { IntakePackage } from '@/lib/intake-contract';
import { pendingCandidateSchema } from '@/lib/pending-candidate';
import { checkedRoadPreview, reviewedRoadFacts } from '@/lib/road-preview-review';

type Document = {
  id: string;
  sourceId: string;
  hash: string;
  url: string;
  licenseBasis: string | null;
  sourceApproved: boolean;
  permissionReviewed: boolean;
};
type Original = { sourceId: string; hash: string; url: string; name: string; document?: Document };
type Row = { work: Work; current: Work; status: string; error?: string };
class OwnerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function readInGroups<T, R>(
  values: T[],
  read: (value: T) => Promise<R>,
  progress: (done: number) => void,
) {
  const result: R[] = [];
  for (let start = 0; start < values.length; start += 4) {
    result.push(...(await Promise.all(values.slice(start, start + 4).map(read))));
    progress(result.length);
  }
  return result;
}
const identity = (d: { hash: string; url: string }) => `${d.hash}|${d.url}`;
async function api(path: string, body?: unknown) {
  const response = await fetch(
    path,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        }
      : { cache: 'no-store' },
  );
  const value = await response.json();
  if (!response.ok)
    throw new OwnerRequestError(value.error || 'Owner action failed', response.status);
  return value;
}
async function roadAction(body: unknown) {
  const response = await fetch('/api/v1/admin/road-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const value = await response.json();
  return { ...value, complete: response.ok && value.complete === true };
}
async function pending(id: string) {
  const data = await api('/api/v1/admin/review?' + new URLSearchParams({ id }));
  return pendingCandidateSchema.parse(data.candidate);
}
async function inspectOriginal(original: Original) {
  const data = await api(
    '/api/v1/admin/source-permission?' +
      new URLSearchParams({ sourceId: original.sourceId, hash: original.hash, url: original.url }),
  );
  const d = data.document as Document;
  if (d.sourceId !== original.sourceId || d.hash !== original.hash || d.url !== original.url)
    throw new Error('Original identity mismatch');
  return d;
}

export function RoadPreviewReview() {
  const [batches, setBatches] = useState<IntakePackage[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [originals, setOriginals] = useState<Original[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [textBasis, setTextBasis] = useState(
      'Accurate attributed reproduction of official OMMAS text and data under its preserved copyright policy. Retain source retrieval and edition dates; state that Hisaab is independent and not endorsed by government. Excludes logos, photographs and third-party material. No unverified currency scale, payment, or completion claim is made.',
    ),
    [geoBasis, setGeoBasis] = useState(
      'Government Open Data License India applies to the official GeoSadak 2022 GIS release, whose official release announcement identifies DataMeet. Attribute Ministry of Rural Development, NRIDA, GeoSadak 2022 and DataMeet archive. Retain edition and original vertex precision. Archived proposal coordinates do not verify current physical sites.',
    ),
    [evidence, setEvidence] = useState(
      'OMMAS policy SHA256 83df7190a29f5968a68d4b0b231b5591776e94ae07c9441ea6009bb8e8019e30. Official PIB GeoSadak release PRID1800373 SHA256 8f2d92380fe70e51201b936ac78b8f0aace2a0453fed8042beb7b4ebb8fb639e. DataMeet archive commit ae9940c94ea61ebb1503952622b990aa1f0ec9d6. Exact originals and all route/record checks are in the private preservation manifest and two-hundred/claim-checks.json.',
    ),
    [rightsConfirm, setRightsConfirm] = useState(false),
    [factsConfirm, setFactsConfirm] = useState(false),
    [publishConfirm, setPublishConfirm] = useState(false),
    [reason, setReason] = useState(
      'Verified only the reported sanction dates and agreement dates/references in the official PMGSY work report, matched to the preserved original row and archived GeoSadak proposal route. Kept source attribution and archived-point limits in each card. These dates are not original signed orders. No spending, recipient, payment, settlement, contractor, current site condition or completion is claimed; all such evidence remains unknown.',
    );
  function update(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.work.id === id ? { ...row, ...patch } : row)));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect() {
    const works = batches.flatMap((batch) => batch.projects);
    if (!works.length) throw new Error('Load checked road packages first.');
    const documents = new Map<string, Original>();
    for (const batch of batches) {
      const used = new Set(
        batch.projects.flatMap((w) =>
          w.stages.flatMap((s) => s.receipts.map((r) => r.documentHash)),
        ),
      );
      for (const source of batch.sources)
        if (used.has(source.hash))
          documents.set(`${source.id}|${identity(source)}`, {
            sourceId: source.id,
            hash: source.hash,
            url: source.url,
            name: source.name,
          });
    }
    const result = await readInGroups(
      works,
      async (work): Promise<Row> => {
        let current: Work;
        try {
          current = await pending(work.id);
        } catch (error) {
          if (!(error instanceof OwnerRequestError) || error.status !== 404) throw error;
          const published = await api('/api/v1/works/' + encodeURIComponent(work.id));
          const confirmed = pendingCandidateSchema.parse(published.work);
          if (confirmed.id !== work.id || confirmed.officialIds[0] !== work.officialIds[0])
            throw new Error('Published identity does not match checked road ' + work.id);
          return { work, current: confirmed, status: 'already-published' };
        }
        const primary = current.stages
          .flatMap((s) => s.receipts)
          .find((r) => r.url.includes('GetRoadTenderDetails'));
        if (!primary) throw new Error('Legacy primary report receipt unavailable for ' + work.id);
        const original = {
          sourceId: 'pmgsy-dashboard',
          hash: primary.documentHash!,
          url: primary.url,
          name: 'Preserved primary PMGSY original',
        };
        documents.set(`${original.sourceId}|${identity(original)}`, original);
        return {
          work,
          current,
          status: current.stages.some((s) => s.state === 'found' || s.reviewStatus === 'verified')
            ? 'held-reviewed'
            : 'inspected',
        };
      },
      (done) => setMessage(`Inspected ${done}/${works.length} exact road identities.`),
    );
    const sources = Array.from(documents.values());
    const inspected = await readInGroups(
      sources,
      async (source) => ({ ...source, document: await inspectOriginal(source) }),
      (done) => setMessage(`Inspected ${done}/${sources.length} exact originals.`),
    );
    setRows(result);
    setOriginals(inspected);
    setMessage(
      'Inspection complete. Review the listed source identities and road facts before separate decisions.',
    );
  }
  function permissions() {
    const map = new Map<string, string>();
    for (const original of originals) {
      const d = original.document;
      if (!d?.permissionReviewed || !d.sourceApproved || !d.licenseBasis)
        throw new Error('Record and recheck all listed original rights first.');
      map.set(identity(original), d.licenseBasis);
    }
    return map;
  }
  return (
    <main className="review-page">
      <a href="/admin">← Owner console</a>
      <div className="eyebrow">PRIVATE OWNER REVIEW</div>
      <h1>Review the first road preview.</h1>
      <p>
        Packages supply checked source facts for review. Loading them grants no rights, changes no
        record and publishes nothing. Every action uses the existing MFA-protected owner routes.
      </p>
      <p>
        Scope: official reported sanction and agreement dates; archived proposal vertices. No money,
        payment, completion, contractor or physical-site verification is approved here.
      </p>
      <label className="field">
        Checked road preview packages
        <input
          type="file"
          accept="application/json,.json"
          multiple
          disabled={busy}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            void run(async () => {
              const loaded = [];
              for (const file of files) {
                if (file.size > 2 * 1024 * 1024) throw new Error('Package exceeds 2 MiB.');
                loaded.push(checkedRoadPreview(JSON.parse(await file.text())));
              }
              const ids = loaded.flatMap((b) => b.projects.map((w) => w.id));
              if (new Set(ids).size !== ids.length || ids.length > 200)
                throw new Error('Use at most 200 unique checked road identities.');
              setBatches(loaded);
              setRows([]);
              setOriginals([]);
              setRightsConfirm(false);
              setFactsConfirm(false);
              setPublishConfirm(false);
              setMessage(
                `${ids.length} unapproved road drafts loaded. Inspect preserved candidates and originals next.`,
              );
            });
          }}
        />
      </label>
      <button
        className="secondary"
        disabled={busy || !batches.length}
        onClick={() => void run(inspect)}
      >
        Inspect preserved road records and originals
      </button>
      <p>
        {rows.length} inspected roads · {originals.length} exact source-document identities ·{' '}
        {rows.filter((r) => r.status === 'published').length} publication confirmations ·{' '}
        {rows.filter((r) => r.status === 'already-published').length} previously published
      </p>
      <details>
        <summary>
          Review loaded road facts and source receipts (
          {batches.reduce((n, b) => n + b.projects.length, 0)})
        </summary>
        {batches
          .flatMap((b) => b.projects)
          .map((w) => (
            <details className="receipt-document" key={w.id}>
              <summary>
                {w.title} · {w.district}, {w.state}
              </summary>
              <p>
                {w.id} · {w.officialIds.join(', ')} · {w.areaId}
              </p>
              <p>
                {w.location?.join(', ')} · {w.physicalVerification}
              </p>
              <p>{w.summary}</p>
              {w.stages
                .filter((s) => s.receipts.length)
                .map((s) => (
                  <section key={s.id}>
                    <h3>
                      {s.label}: {s.date}
                    </h3>
                    <p>{s.description}</p>
                    {s.receipts.map((r) => (
                      <details key={r.id}>
                        <summary>{r.title}</summary>
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          Original source
                        </a>
                        <p>{r.locator}</p>
                        <p style={{ overflowWrap: 'anywhere' }}>{r.documentHash}</p>
                        <pre style={{ whiteSpace: 'pre-wrap' }}>{r.rawText}</pre>
                      </details>
                    ))}
                  </section>
                ))}
            </details>
          ))}
      </details>
      {originals.length > 0 && (
        <>
          <details>
            <summary>Review exact source-document identities ({originals.length})</summary>
            {originals.map((o) => (
              <article key={o.sourceId + o.hash} className="receipt-document">
                <h3>{o.name}</h3>
                <p>{o.sourceId}</p>
                <a href={o.url} target="_blank" rel="noopener noreferrer">
                  Original source
                </a>
                <p style={{ overflowWrap: 'anywhere' }}>{o.hash}</p>
                <p>
                  {o.document?.permissionReviewed
                    ? 'Rights decision recorded'
                    : 'Awaiting rights decision'}
                </p>
                <p>{o.document?.licenseBasis}</p>
              </article>
            ))}
          </details>
          <h2>1. Source rights</h2>
          <label className="field">
            Verified OMMAS text and data reuse basis
            <textarea
              minLength={30}
              maxLength={2000}
              value={textBasis}
              onChange={(e) => setTextBasis(e.target.value)}
            />
          </label>
          <label className="field">
            Verified archived GIS reuse basis
            <textarea
              minLength={30}
              maxLength={2000}
              value={geoBasis}
              onChange={(e) => setGeoBasis(e.target.value)}
            />
          </label>
          <label className="field">
            Preserved policy evidence references and checksums
            <textarea
              minLength={20}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label className="consent">
            <input
              type="checkbox"
              checked={rightsConfirm}
              onChange={(e) => setRightsConfirm(e.target.checked)}
            />
            I inspected every listed exact original, the applicable text or GIS reuse conditions,
            attribution and third-party limits.
          </label>
          <button
            className="secondary"
            disabled={
              busy ||
              !rightsConfirm ||
              textBasis.length < 30 ||
              geoBasis.length < 30 ||
              evidence.length < 20
            }
            onClick={() =>
              void run(async () => {
                const documents = originals.flatMap((original) => {
                  const d = original.document;
                  if (!d) throw new Error('Inspect every exact original before recording rights.');
                  if (d.permissionReviewed && d.sourceApproved && d.licenseBasis) return [];
                  return [
                    {
                      id: d.id,
                      sourceId: d.sourceId,
                      hash: d.hash,
                      url: d.url,
                      basis: original.url.endsWith('.zip') ? geoBasis : textBasis,
                      evidence,
                    },
                  ];
                });
                if (documents.length) {
                  await roadAction({
                    action: 'rights',
                    documents,
                    reason:
                      'Document-specific rights review for the exact preserved source identities listed in the owner road preview.',
                    confirmed: true,
                  });
                }
                const refreshed = await readInGroups(
                  originals,
                  async (original) => ({ ...original, document: await inspectOriginal(original) }),
                  (done) => setMessage(`Rights read-back ${done}/${originals.length}.`),
                );
                if (
                  refreshed.some(
                    (o) =>
                      !o.document?.permissionReviewed ||
                      !o.document.sourceApproved ||
                      !o.document.licenseBasis,
                  )
                )
                  throw new Error(
                    'Rights read-back failed. Inspect the exact originals before continuing.',
                  );
                setOriginals(refreshed);
                setRightsConfirm(false);
                setMessage(
                  'All listed exact originals have recorded rights decisions. No road was reconciled or published.',
                );
              })
            }
          >
            Record source rights
          </button>
          <h2>2. Narrow road facts</h2>
          <label className="field">
            Documented fact review and publication reason
            <textarea
              minLength={20}
              maxLength={4000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="consent">
            <input
              type="checkbox"
              checked={factsConfirm}
              onChange={(e) => setFactsConfirm(e.target.checked)}
            />
            I checked all listed work identities, proposed district correspondence, original route
            vertices and reported dates. I approve only those source claims; physical sites, money,
            payments and completion remain unverified.
          </label>
          <button
            className="secondary"
            disabled={busy || !factsConfirm || reason.length < 20}
            onClick={() =>
              void run(async () => {
                const rights = permissions();
                const pendingRows = rows.filter((row) =>
                  ['inspected', 'error'].includes(row.status),
                );
                for (let start = 0; start < pendingRows.length; start += 25) {
                  const group = pendingRows.slice(start, start + 25);
                  const records = [];
                  for (const row of group) {
                    const latest = await pending(row.work.id);
                    if (
                      latest.stages.some(
                        (s) => s.state === 'found' || s.reviewStatus === 'verified',
                      )
                    ) {
                      update(row.work.id, {
                        status: 'held-reviewed',
                        error:
                          'Already reviewed evidence preserved. Use the main console to publish or resolve it.',
                      });
                      continue;
                    }
                    if (JSON.stringify(latest) !== JSON.stringify(row.current))
                      throw new Error(
                        'Preserved candidate changed since inspection. Inspect again.',
                      );
                    records.push({ expected: latest, work: reviewedRoadFacts(row.work, rights) });
                  }
                  if (!records.length) continue;
                  const result = await roadAction({
                    action: 'reconcile',
                    records,
                    reason,
                    confirmed: true,
                  });
                  for (const checkpoint of result.checkpoints ?? []) {
                    const row = rows.find((item) => item.work.id === checkpoint.id)!;
                    update(checkpoint.id, {
                      current: checkpoint.work,
                      status: 'reconciled',
                      error: undefined,
                    });
                  }
                  if (!result.complete)
                    throw new Error(
                      `Reconciliation stopped at ${result.failedId}: ${result.error}. Completed records are saved above; inspect before retrying.`,
                    );
                  setMessage(
                    `Reconciled ${Math.min(start + group.length, pendingRows.length)}/${pendingRows.length} roads.`,
                  );
                }
                setFactsConfirm(false);
                setMessage(
                  'Supported road facts reconciled. Existing reviewed records were held unchanged. Publication remains a separate action.',
                );
              })
            }
          >
            Reconcile checked road facts
          </button>
          <h2>3. Publication</h2>
          <label className="consent">
            <input
              type="checkbox"
              checked={publishConfirm}
              onChange={(e) => setPublishConfirm(e.target.checked)}
            />
            I intend to publish only this session’s reconciled road cards, with original source
            receipts and explicit unknown payment, completion and site verification.
          </label>
          <button
            className="primary"
            disabled={
              busy ||
              !publishConfirm ||
              reason.length < 20 ||
              !rows.some((r) => r.status === 'reconciled')
            }
            onClick={() =>
              void run(async () => {
                permissions();
                const ready = rows.filter((r) => r.status === 'reconciled');
                for (let start = 0; start < ready.length; start += 25) {
                  const group = ready.slice(start, start + 25);
                  const records = [];
                  for (const row of group) {
                    const latest = await pending(row.work.id);
                    if (JSON.stringify(latest) !== JSON.stringify(row.current))
                      throw new Error(
                        'Candidate changed after reconciliation. Inspect and decide again.',
                      );
                    records.push({ expected: latest });
                  }
                  const result = await roadAction({
                    action: 'publish',
                    records,
                    reason,
                    confirmed: true,
                  });
                  for (const checkpoint of result.checkpoints ?? [])
                    update(checkpoint.id, {
                      current: checkpoint.work,
                      status: 'published',
                      error: undefined,
                    });
                  if (!result.complete)
                    throw new Error(
                      `Publication stopped at ${result.failedId}: ${result.error}. Completed records are saved above; inspect before retrying.`,
                    );
                  setMessage(
                    `Published ${Math.min(start + group.length, ready.length)}/${ready.length} reviewed roads.`,
                  );
                }
                setPublishConfirm(false);
                setMessage(
                  'Publication responses confirmed. Verify the public catalogue count and map separately.',
                );
              })
            }
          >
            Publish reviewed road cards
          </button>
        </>
      )}
      {rows.length > 0 && (
        <details open>
          <summary>Per-record checkpoint</summary>
          <p>
            On an error, stop and inspect the preserved record before retrying. This page does not
            infer publication from an attempted request.
          </p>
          {rows.map((r) => (
            <p key={r.work.id}>
              {r.work.id} · {r.status}
              {r.error ? ' · ' + r.error : ''}
            </p>
          ))}
        </details>
      )}
      {busy && <p role="status">Owner review action in progress. Keep this page open.</p>}
      {message && <p role="status">{message}</p>}
    </main>
  );
}
