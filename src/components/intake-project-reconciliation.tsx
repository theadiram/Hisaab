'use client';
import { useMemo, useState } from 'react';
import type { Work } from '@/lib/model';
import { pendingCandidateSchema } from '@/lib/pending-candidate';
import { compareIntakeProject } from '@/lib/intake-project-comparison';

export function IntakeProjectReconciliation({ proposed }: { proposed: Work }) {
  const [current, setCurrent] = useState<Work | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [inspection, setInspection] = useState(0);
  const comparison = useMemo(
    () => (current ? compareIntakeProject(proposed, current) : null),
    [current, proposed],
  );
  async function inspect() {
    const response = await fetch(
      '/api/v1/admin/review?' + new URLSearchParams({ id: proposed.id }),
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const work = pendingCandidateSchema.parse(data.candidate);
    if (work.id !== proposed.id)
      throw new Error('The preserved candidate identity does not match this draft.');
    return work;
  }
  return (
    <details className="receipt-document">
      <summary>{proposed.title} · compare pending project draft</summary>
      <p>
        {proposed.district}, {proposed.state} · {proposed.financialYear}
      </p>
      <p>Candidate: {proposed.id}</p>
      <p>
        This intake draft remains unapproved. If this ID already exists, preparing the queue
        preserves the original and its import edition. Applying this draft requires a separate
        documented reconciliation.
      </p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMessage('');
          void inspect()
            .then((work) => {
              setCurrent(work);
              setInspection((value) => value + 1);
            })
            .catch((e) => {
              setCurrent(null);
              setMessage((e as Error).message);
            })
            .finally(() => setBusy(false));
        }}
      >
        Inspect the exact preserved pending candidate
      </button>
      {comparison && (
        <>
          <p>
            Changed fields:{' '}
            {comparison.differences.map((d) => d.field).join(', ') ||
              'No changes to compared identity, geography, stage sources or money.'}
          </p>
          {comparison.holds.map((hold) => (
            <p className="info-note" key={hold}>
              {hold} <a href="/admin">Open main owner console →</a>
            </p>
          ))}
          {comparison.differences.map((difference) => (
            <details key={difference.field}>
              <summary>{difference.field}: preserved versus proposed</summary>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))',
                  gap: '1rem',
                }}
              >
                <section>
                  <h4>Preserved pending candidate</h4>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {JSON.stringify(difference.current, null, 2)}
                  </pre>
                </section>
                <section>
                  <h4>Proposed intake draft</h4>
                  <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {JSON.stringify(difference.proposed, null, 2)}
                  </pre>
                </section>
              </div>
            </details>
          ))}
          <details>
            <summary>Inspect the proposed stage/source comparisons</summary>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {JSON.stringify(comparison.proposedStages, null, 2)}
            </pre>
          </details>
          {comparison.canReconcile && (
            <form
              key={inspection}
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget),
                  reason = String(form.get('reason') ?? '').trim(),
                  confirmed = form.get('confirmed') === 'on';
                if (reason.length < 20 || !confirmed) {
                  setMessage('A documented reason and explicit confirmation are required.');
                  return;
                }
                setBusy(true);
                setMessage('');
                void (async () => {
                  const latest = await inspect();
                  const latestComparison = compareIntakeProject(proposed, latest);
                  if (
                    !latestComparison.canReconcile ||
                    JSON.stringify(latest) !== JSON.stringify(current)
                  ) {
                    setCurrent(latest);
                    setInspection((value) => value + 1);
                    throw new Error(
                      'The preserved candidate changed. Inspect the updated comparison and make a new decision.',
                    );
                  }
                  const response = await fetch('/api/v1/admin/reconcile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ work: proposed, reason, confirmed: true }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setCurrent(await inspect());
                  setInspection((value) => value + 1);
                  setMessage(
                    'Pending reconciliation saved. No stage, amount, source right or publication was approved. Review the candidate’s evidence in the main owner console.',
                  );
                })()
                  .catch((e) => setMessage((e as Error).message))
                  .finally(() => setBusy(false));
              }}
            >
              <label className="field">
                Reason and documentary basis for applying these pending source changes
                <textarea name="reason" minLength={20} maxLength={4000} rows={3} required />
              </label>
              <label className="consent">
                <input type="checkbox" name="confirmed" required />I compared the preserved record
                with this pending draft, checked the documentary identity and proposed geography,
                and intend to save these changes without approving evidence or publication.
              </label>
              <button className="secondary" disabled={busy}>
                Save explicit pending reconciliation
              </button>
            </form>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
