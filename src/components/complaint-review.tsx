'use client';
import { useEffect, useState } from 'react';
import type { ComplaintPacket } from '@/lib/complaints';
type Packet = { id: string; status: string; reference: string; payload: ComplaintPacket };
export function ComplaintReview() {
  const [packets, setPackets] = useState<Packet[]>([]),
    [configured, setConfigured] = useState(false),
    [message, setMessage] = useState('');
  async function refresh() {
    const r = await fetch('/api/v1/admin/complaints');
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setPackets(d.packets);
    setConfigured(d.emailConfigured);
  }
  useEffect(() => {
    void refresh().catch((e) => setMessage(e.message));
  }, []);
  return (
    <main className="review-page">
      <a href="/admin">← Private owner console</a>
      <h1>Citizen handoff review</h1>
      <p>
        {configured
          ? 'Dedicated Hisaab sender is configured.'
          : 'Email sending is disabled until a dedicated Hisaab domain and Resend credentials are configured.'}{' '}
        Portal filing remains citizen-assisted.
      </p>
      {packets.map((p) => (
        <article className="review-work" key={p.id}>
          <h2>
            {p.reference} · {p.status}
          </h2>
          <p>
            {p.payload.route.authority} · {p.payload.route.destination}
          </p>
          <a href={p.payload.route.policy_url} target="_blank" rel="noopener noreferrer">
            Official acceptance policy
          </a>
          <p>{p.payload.route.policy_note}</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{p.payload.draft}</pre>
          <p>
            Citizen delegation:{' '}
            {p.payload.delegationConsent ? 'given for this exact text' : 'not given'} · Reply
            address: {p.payload.replyTo ?? 'none'}
          </p>
          <ComplaintEvidence id={p.id} onSaved={refresh} />
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await fetch('/api/v1/admin/complaints', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    id: p.id,
                    action: f.get('action'),
                    reason: f.get('reason'),
                    confirmed: f.get('confirmed') === 'on',
                  }),
                });
                const d = await r.json();
                if (!r.ok) throw new Error(d.error);
                await refresh();
                setMessage(
                  'Decision recorded. An email transport result does not establish official registration.',
                );
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <label className="field">
              Action
              <select name="action">
                <option value="ready">Approve reviewed packet</option>
                <option value="decline">Decline handoff</option>
                {p.payload.route.channel === 'email' && configured && p.status === 'ready' && (
                  <option value="send">Send the approved exact text</option>
                )}
              </select>
            </label>
            <label className="field">
              Documented review
              <textarea name="reason" minLength={30} required />
            </label>
            <label className="consent">
              <input name="confirmed" type="checkbox" required />I reviewed the citizen consent,
              exact text, recipient, jurisdiction and current acceptance policy.
            </label>
            <button className="primary">Record decision</button>
          </form>
        </article>
      ))}
      {!packets.length && <p>No citizen packets await review.</p>}
      <details>
        <summary>Verify an additional filing route</summary>
        <p>
          Enter an official route with documented acceptance and an expiry date. Emails cannot be
          used for CPGRAMS.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch('/api/v1/admin/complaint-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  route: JSON.parse(String(f.get('route'))),
                  reason: f.get('reason'),
                }),
              });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setMessage('Official route review saved.');
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label className="field">
            Route JSON
            <textarea name="route" rows={8} required />
          </label>
          <label className="field">
            Official evidence and decision
            <textarea name="reason" minLength={30} required />
          </label>
          <button className="secondary">Save verified route</button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
    </main>
  );
}

function ComplaintEvidence({ id, onSaved }: { id: string; onSaved: () => Promise<void> }) {
  const [evidence, setEvidence] = useState<{
      documents: { id: string; name: string; sha256: string }[];
      photos: { id: string }[];
      videos: { id: string; name: string }[];
    } | null>(null),
    [message, setMessage] = useState('');
  const url = (kind: string, file: string) =>
    '/api/v1/admin/complaints/evidence?' + new URLSearchParams({ id, kind, file });
  return (
    <details
      onToggle={(e) => {
        if (e.currentTarget.open && !evidence)
          void fetch('/api/v1/admin/complaints/evidence?' + new URLSearchParams({ id }))
            .then(async (r) => {
              if (!r.ok) throw new Error('Private evidence could not be loaded');
              setEvidence(await r.json());
            })
            .catch((e) => setMessage(e.message));
      }}
    >
      <summary>Inspect the citizen’s private supporting evidence</summary>
      <p>
        Uploads remain citizen-provided evidence. Review the original acknowledgement before
        recording an official reference.
      </p>
      {evidence?.documents.map((d) => (
        <p key={d.id}>
          <a href={url('document', d.id)}>{d.name}</a>
          <small> · SHA-256 {d.sha256}</small>
        </p>
      ))}
      {evidence?.photos.map((p) => (
        <img
          key={p.id}
          src={url('photo', p.id)}
          alt="Private citizen evidence preview"
          style={{ maxWidth: '100%' }}
        />
      ))}
      {evidence?.videos.map((v) => (
        <figure key={v.id}>
          <video controls preload="none" src={url('video', v.id)} style={{ width: '100%' }} />
          <figcaption>{v.name}</figcaption>
        </figure>
      ))}
      {evidence?.documents.length ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              r = await fetch('/api/v1/admin/complaints/evidence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id,
                  attachmentId: f.get('attachmentId'),
                  date: f.get('date'),
                  reference: f.get('reference'),
                  reason: f.get('reason'),
                  confirmed: f.get('confirmed') === 'on',
                }),
              }),
              d = await r.json();
            if (!r.ok) {
              setMessage(d.error);
              return;
            }
            setMessage('Documentary acknowledgement recorded.');
            await onSaved();
          }}
        >
          <h3>Record an authority acknowledgement</h3>
          <label className="field">
            Original document
            <select name="attachmentId">
              {evidence.documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Official reference
            <input name="reference" maxLength={200} required />
          </label>
          <label className="field">
            Acknowledgement date
            <input name="date" type="date" max={new Date().toISOString().slice(0, 10)} required />
          </label>
          <label className="field">
            Evidence review
            <textarea name="reason" minLength={30} maxLength={2000} required />
          </label>
          <label className="consent">
            <input name="confirmed" type="checkbox" required />I checked the issuing authority,
            reference, date and this exact preserved document.
          </label>
          <button className="secondary">Record reviewed acknowledgement</button>
        </form>
      ) : (
        <p>No acknowledgement document is available.</p>
      )}
      {message && <p role="status">{message}</p>}
    </details>
  );
}
