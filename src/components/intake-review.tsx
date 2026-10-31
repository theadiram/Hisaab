'use client';
import { createClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { validateIntake, type IntakePackage } from '@/lib/intake-contract';
import { formatMoney } from '@/lib/money';
import { IntakeSourceRightsReview } from './intake-source-rights-review';
import { IntakeProjectReconciliation } from './intake-project-reconciliation';
import { PreparedBatchIntake } from './prepared-batch-intake';
type Batch = {
  id: string;
  jurisdiction: string;
  cutoff: string;
  projects: number;
  funding: number;
  payments: number;
};
export function IntakeReview() {
  const [batches, setBatches] = useState<Batch[]>([]),
    [selected, setSelected] = useState<IntakePackage | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch('/api/v1/admin/intake');
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setBatches(data.batches);
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="review-page">
      <a href="/admin">← Private owner console</a>
      <p className="eyebrow">NATIONWIDE DATA INTAKE</p>
      <h1>Bring the evidence together.</h1>
      <p>
        Agent packages are validated and preserved privately. Funding and project facts require
        separate evidence and source-rights review before publication.
      </p>
      <details>
        <summary>Upload a private original</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void action(async () => {
              const file = f.get('file');
              if (!(file instanceof File) || !file.size) throw new Error('Choose an original');
              if (file.size > 10 * 1024 * 1024)
                throw new Error('Pilot originals are limited to 10 MB');
              const hash = Array.from(
                new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())),
              )
                .map((n) => n.toString(16).padStart(2, '0'))
                .join('');
              const r = await fetch('/api/v1/admin/intake/original', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceId: f.get('sourceId'), hash, size: file.size }),
              });
              const signed = await r.json();
              if (!r.ok) throw new Error(signed.error);
              const client = createClient(
                  process.env.NEXT_PUBLIC_SUPABASE_URL!,
                  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
                  { auth: { persistSession: false } },
                ),
                upload = await client.storage
                  .from('source-originals')
                  .uploadToSignedUrl(signed.path, signed.token, file, {
                    contentType: file.type || 'application/octet-stream',
                  });
              if (upload.error) throw upload.error;
              setMessage(
                'Private original uploaded. Add this storagePath and hash to the package: ' +
                  signed.path,
              );
            });
          }}
        >
          <label className="field">
            Stable source ID
            <input name="sourceId" pattern="[a-zA-Z0-9_-]{1,100}" required />
          </label>
          <label className="field">
            Original file
            <input name="file" type="file" required />
          </label>
          <button className="secondary" disabled={busy}>
            Upload privately and calculate checksum
          </button>
        </form>
      </details>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void action(async () => {
            const file = f.get('package');
            if (!(file instanceof File) || file.size > 2 * 1024 * 1024)
              throw new Error('Select a JSON package up to 2 MB');
            const parsed = JSON.parse(await file.text());
            validateIntake(parsed);
            const r = await fetch('/api/v1/admin/intake', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(parsed),
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            await refresh();
            setMessage(
              'Package preserved privately. ' +
                data.totalRecords +
                ' records; no facts were published.',
            );
          });
        }}
      >
        <label className="field">
          Validated agent package
          <input name="package" type="file" accept="application/json,.json" required />
        </label>
        <button className="primary" disabled={busy}>
          Validate and stage package
        </button>
      </form>
      {message && <p role="status">{message}</p>}
      <PreparedBatchIntake onStaged={refresh} />
      <h2>Private packages</h2>
      {batches.map((b) => (
        <button
          className="atlas-programme-row"
          key={b.id}
          onClick={() =>
            void action(async () => {
              const r = await fetch('/api/v1/admin/intake?id=' + encodeURIComponent(b.id));
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              setSelected(data.batch.payload);
            })
          }
        >
          <strong>{b.id}</strong>
          <small>
            {b.jurisdiction} · cutoff {b.cutoff} · {b.projects} projects · {b.payments} payment
            records · {b.funding} funding facts
          </small>
        </button>
      ))}
      {!batches.length && <p>No validated packages have been staged.</p>}
      {selected && (
        <section>
          <h2>{selected.batchId}</h2>
          <p>{selected.coverage.missing.join(' ')}</p>
          <h3>Review every source original</h3>
          <p>
            Each document needs its own rights decision, including separate geometry and photo
            sources. A recorded source permission does not approve project evidence or publication.
          </p>
          {selected.sources.map((source) => (
            <IntakeSourceRightsReview key={source.id + ':' + source.hash} source={source} />
          ))}
          <p>Next action: {selected.coverage.nextAction}</p>
          <p>Checkpoint: {selected.coverage.checkpoint}</p>
          <button
            className="secondary"
            onClick={() =>
              void action(async () => {
                const r = await fetch('/api/v1/admin/intake/reviews', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ batchId: selected.batchId }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                setMessage(
                  data.projects + ' project candidates are ready for individual owner review.',
                );
              })
            }
          >
            Prepare project review queue
          </button>
          <a className="atlas-text-button" href="/admin">
            Review project stages and amounts →
          </a>
          <h3>Compare project drafts with preserved candidates</h3>
          <p>
            Existing project IDs keep their original record until you explicitly reconcile a pending
            draft. Already reviewed evidence is held for the main owner console.
          </p>
          {selected.projects.map((project) => (
            <IntakeProjectReconciliation
              key={selected.batchId + ':' + project.id}
              proposed={project}
            />
          ))}
          {selected.funding.map((r) => (
            <DevelopmentReview key={r.id} id={r.id} title={r.programme} amount={r.amountRupees} />
          ))}
          {(
            ['payments', 'allocations', 'assets', 'contracts', 'parties', 'completion'] as const
          ).map((kind) => (
            <details key={kind}>
              <summary>
                {kind} · {selected[kind].length} private records
              </summary>
              {selected[kind].map((r) => (
                <pre key={r.id} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                  {JSON.stringify(r, null, 2)}
                </pre>
              ))}
            </details>
          ))}
        </section>
      )}
    </main>
  );
}
function DevelopmentReview({
  id,
  title,
  amount,
}: {
  id: string;
  title: string;
  amount: string | null;
}) {
  const [doc, setDoc] = useState<string | null>(null),
    [message, setMessage] = useState('');
  async function submit(url: string, input: unknown) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    return data;
  }
  return (
    <article className="review-work">
      <h3>{title}</h3>
      <p>{formatMoney(amount)}</p>
      <button
        onClick={() =>
          void fetch('/api/v1/admin/development?id=' + encodeURIComponent(id))
            .then(async (r) => {
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setDoc(d.record.documentId);
              setMessage(JSON.stringify(d.record.payload, null, 2));
            })
            .catch((e) => setMessage(e.message))
        }
      >
        Inspect preserved fact and source
      </button>
      {doc && (
        <details>
          <summary>Classify this funding fact</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const patch = JSON.parse(String(f.get('patch')));
                void submit('/api/v1/admin/development', {
                  id,
                  action: 'classify',
                  patch,
                  reason: f.get('reason'),
                  decisions: {
                    sourceChecked: false,
                    unitsChecked: false,
                    jurisdictionChecked: false,
                    scopeChecked: false,
                    editionsChecked: false,
                    nonOverlapChecked: false,
                    confirmed: false,
                  },
                })
                  .then(() =>
                    setMessage(
                      'Classification saved privately. Inspect the updated fact before publication.',
                    ),
                  )
                  .catch((e) => setMessage(e.message));
              } catch {
                setMessage('Enter valid classification JSON');
              }
            }}
          >
            <p>
              Original amounts and source identities remain immutable. Change classification,
              purpose, scope, origin, shares, reconciliationKey, disjointEvidence, aggregation,
              parentKey, notes or instrument only when the evidence supports it.
            </p>
            <label className="field">
              Documented classification fields
              <textarea
                name="patch"
                defaultValue={'{"classification":"awaiting_review"}'}
                required
              />
            </label>
            <label className="field">
              Evidence and reason
              <textarea name="reason" minLength={30} required />
            </label>
            <button className="secondary">Save private classification</button>
          </form>
        </details>
      )}
      {doc && (
        <details>
          <summary>Review original reuse basis</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit('/api/v1/admin/source-permission', {
                documentId: doc,
                basis: f.get('basis'),
                evidence: f.get('evidence'),
                confirmed: f.get('confirmed') === 'on',
              })
                .then(() =>
                  setMessage(
                    'Source rights decision saved. Financial fact approval is still required.',
                  ),
                )
                .catch((e) => setMessage(e.message));
            }}
          >
            <label className="field">
              Verified reuse basis
              <textarea name="basis" minLength={30} required />
            </label>
            <label className="field">
              Supporting policy or permission reference
              <textarea name="evidence" minLength={20} required />
            </label>
            <label className="consent">
              <input type="checkbox" name="confirmed" required />I checked the source rights
              evidence.
            </label>
            <button className="secondary">Save rights review</button>
          </form>
        </details>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const decisions = Object.fromEntries(
            [
              'sourceChecked',
              'unitsChecked',
              'jurisdictionChecked',
              'scopeChecked',
              'editionsChecked',
              'nonOverlapChecked',
              'confirmed',
            ].map((k) => [k, f.get(k) === 'on']),
          );
          void submit('/api/v1/admin/development', {
            id,
            action: f.get('action'),
            reason: f.get('reason'),
            decisions,
          })
            .then(() => setMessage('Explicit review decision saved.'))
            .catch((e) => setMessage(e.message));
        }}
      >
        {[
          ['sourceChecked', 'Original and exact source locator'],
          ['unitsChecked', 'Amount units and funding shares'],
          ['jurisdictionChecked', 'State and geographic attribution'],
          ['scopeChecked', 'Transfers versus development and accounting basis'],
          ['editionsChecked', 'Reporting period and edition'],
          ['nonOverlapChecked', 'Parent/child and overlapping funding'],
          ['confirmed', 'Public redaction and final decision'],
        ].map(([key, label]) => (
          <label className="consent" key={key}>
            <input type="checkbox" name={key} />
            {label}
          </label>
        ))}
        <label className="field">
          Action
          <select name="action">
            <option value="publish">Publish reviewed fact</option>
            <option value="withdraw">Withdraw public fact</option>
          </select>
        </label>
        <label className="field">
          Documented review decision
          <textarea name="reason" minLength={30} required />
        </label>
        <button className="primary">Save explicit decision</button>
      </form>
      {message && (
        <pre role="status" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {message}
        </pre>
      )}
    </article>
  );
}
