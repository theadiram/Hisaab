'use client';
import { useEffect, useState } from 'react';
import { PrivateDocuments } from './private-documents';
type Event = {
  verification?: string;
  id: string;
  type: string;
  description: string;
  date: string;
  reference: string;
  createdAt: string;
};
const labels: Record<string, string> = {
  acknowledged: 'Documentary acknowledgement reviewed by owner',
  acknowledgement_uploaded: 'Acknowledgement supplied by you',
  citizen_reported_submission: 'Submission reported by you',
  authority_response: 'Response recorded by you',
  citizen_accepted: 'Resolution accepted by you',
  reopened: 'Question reopened by you',
};
export function CaseUpdates({ caseReference }: { caseReference: string }) {
  const [events, setEvents] = useState<Event[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch('/api/v1/reports/events');
    if (!r.ok) throw new Error('Private updates could not be loaded.');
    setEvents((await r.json()).events);
  }
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [caseReference]);
  return (
    <section aria-label="Private case updates">
      <PrivateDocuments onUploaded={() => void load()} />
      <h3>Your follow-up history</h3>
      <p>
        These entries are private records you provide. They do not independently verify an
        authority’s response or completion.
      </p>
      {events.map((event) => (
        <article className="tracking-case" key={event.id}>
          <strong>{labels[event.type]}</strong>
          <p>{event.description}</p>
          <small>
            {event.verification === 'owner_reviewed_document'
              ? 'Document reviewed by owner'
              : 'Citizen supplied · not independently verified'}
          </small>
          <small>
            {event.date}
            {event.reference && ` · Reference: ${event.reference}`}
          </small>
        </article>
      ))}
      <details>
        <summary>Add a private update</summary>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setBusy(true);
            setMessage('');
            try {
              const r = await fetch('/api/v1/reports/events', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(new FormData(form))),
              });
              const data = await r.json();
              if (!r.ok) throw new Error(data.error);
              form.reset();
              await load();
              setMessage('Private update saved.');
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Update type
            <select name="type">
              {Object.entries(labels)
                .filter(([key]) => !['acknowledgement_uploaded', 'acknowledged'].includes(key))
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Date
            <input name="date" type="date" max={new Date().toISOString().slice(0, 10)} required />
          </label>
          <label className="field">
            Details
            <textarea name="description" minLength={10} maxLength={5000} required rows={3} />
          </label>
          <label className="field">
            Authority reference, if any
            <input name="reference" maxLength={200} />
          </label>
          <button className="primary" disabled={busy}>
            Save private update
          </button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
