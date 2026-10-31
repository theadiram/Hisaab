'use client';
import { useEffect, useState } from 'react';
import type { ComplaintRoute } from '@/lib/complaints';
export function ComplaintHandoff() {
  const [routes, setRoutes] = useState<ComplaintRoute[]>([]),
    [packet, setPacket] = useState<{
      status: string;
      payload: { draft: string; route: ComplaintRoute };
    } | null>(null),
    [routeId, setRouteId] = useState('cpgrams'),
    [message, setMessage] = useState('');
  async function refresh() {
    const r = await fetch('/api/v1/reports/complaint');
    if (r.ok) setPacket((await r.json()).packet);
  }
  useEffect(() => {
    void fetch('/api/v1/complaint-routes')
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setRoutes(d.routes);
      })
      .catch((e) => setMessage(e.message));
    void refresh();
  }, []);
  const route = routes.find((r) => r.id === routeId);
  return (
    <section>
      <h3>Prepare an official handoff</h3>
      <p>
        Your report remains private. Portal registration, owner email review and an official
        acknowledgement are separate steps.
      </p>
      {packet ? (
        <>
          <p>
            <strong>{packet.status.replaceAll('_', ' ')}</strong> · official filing is not
            established by an email status.
          </p>
          <a
            href={
              packet.payload.route.channel === 'portal'
                ? packet.payload.route.destination
                : packet.payload.route.policy_url
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the official filing instructions
          </a>
          <p>{packet.payload.route.policy_note}</p>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{packet.payload.draft}</pre>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage('');
            const f = new FormData(e.currentTarget);
            try {
              const r = await fetch('/api/v1/reports/complaint', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  routeId,
                  draft: f.get('draft'),
                  replyTo: f.get('replyTo') || null,
                  consent: f.get('consent') === 'on',
                  delegationConsent: f.get('delegationConsent') === 'on',
                }),
              });
              const d = await r.json();
              if (!r.ok) throw new Error(d.error);
              await refresh();
              setMessage('Packet prepared privately. It has not been filed.');
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          <label className="field">
            Verified filing route
            <select value={routeId} onChange={(e) => setRouteId(e.target.value)}>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {r.channel}
                </option>
              ))}
            </select>
          </label>
          {route && (
            <p>
              {route.policy_note}{' '}
              <a href={route.policy_url} target="_blank" rel="noopener noreferrer">
                Official instructions
              </a>
            </p>
          )}
          <label className="field">
            Reviewed complaint text
            <textarea
              name="draft"
              minLength={30}
              maxLength={10000}
              rows={6}
              required
              placeholder="Describe the work, its official identifiers, observed condition, dates and the specific inspection or explanation requested."
            />
          </label>
          {route?.channel === 'email' && (
            <>
              <label className="field">
                Your reply email
                <input name="replyTo" type="email" required />
              </label>
              <label className="consent">
                <input name="delegationConsent" type="checkbox" required />I authorize Hisaab to
                send this exact text to {route.destination} after owner review.
              </label>
            </>
          )}
          <label className="consent">
            <input name="consent" type="checkbox" required />I checked this packet and consent to
            private preparation for the selected authority.
          </label>
          <button className="primary" disabled={!route}>
            Prepare private handoff
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
