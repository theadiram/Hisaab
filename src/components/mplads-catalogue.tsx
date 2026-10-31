'use client';
import { sourceRupees } from '@/lib/source-money';
import { useRef, useState } from 'react';
type Project = {
  id: string;
  workId: string;
  state: string;
  house: number;
  textReview: boolean;
  title: string;
};
type Listing = {
  projects: Project[];
  states: string[];
  total: number;
  page: number;
  pageSize: number;
};
type Detail = {
  project: { workId: string; textReview: boolean; titles: string[]; agencies: string[] };
  rows: {
    amount: string | null;
    date: string | null;
    recipient: string;
    status: string;
    encodingIssue: boolean;
    sourceHash: string;
    sourceRow: number;
  }[];
  total: number;
  page: number;
  pageSize: number;
};
export function MpladsCatalogue() {
  const [data, setData] = useState<Listing | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [selected, setSelected] = useState(''),
    [q, setQ] = useState(''),
    [state, setState] = useState(''),
    [house, setHouse] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const request = useRef(0);
  async function load(page = 1, project = '') {
    const sequence = ++request.current;
    setLoading(true);
    setError('');
    if (!project) {
      setDetail(null);
      setSelected('');
    } else {
      setSelected(project);
      setDetail(null);
    }
    try {
      const params = new URLSearchParams({ q, state, house, page: String(page) });
      if (project) params.set('project', project);
      const response = await fetch('/api/v1/admin/mplads-catalogue?' + params, {
        cache: 'no-store',
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (sequence !== request.current) return;
      if (project) setDetail(body);
      else setData(body);
    } catch (e) {
      if (sequence === request.current)
        setError(e instanceof Error ? e.message : 'Catalogue unavailable');
    } finally {
      if (sequence === request.current) setLoading(false);
    }
  }
  return (
    <section aria-label="Nationwide MPLADS source catalogue">
      <h4>Nationwide MPLADS records · Owner review</h4>
      <p>
        Browse the collected Lok Sabha and Rajya Sabha source records. These are unpublished
        candidates; exact locations, transaction references and recipient roles still need evidence.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          Project ID, purpose or agency
          <input value={q} maxLength={100} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label>
          House
          <select value={house} onChange={(e) => setHouse(e.target.value)}>
            <option value="">Both houses</option>
            <option value="2">Lok Sabha</option>
            <option value="1">Rajya Sabha</option>
          </select>
        </label>
        <label>
          State / UT
          <select value={state} onChange={(e) => setState(e.target.value)}>
            <option value="">All collected states / UTs</option>
            {data?.states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <button className="secondary" disabled={loading}>
          {loading ? 'Loading records…' : 'Browse collected projects'}
        </button>
      </form>
      {error && (
        <p role="alert">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {data && (
        <>
          <p>
            {data.total.toLocaleString('en-IN')} project identities matching filters · Page{' '}
            {data.page}
          </p>
          {data.projects.map((p) => (
            <button
              className="secondary"
              key={p.id}
              disabled={loading}
              onClick={() => void load(1, p.id)}
            >
              {p.textReview ? 'Source text requires encoding review' : p.title}
              <br />
              {p.state} · {p.house === 2 ? 'Lok Sabha' : 'Rajya Sabha'} · {p.workId}
            </button>
          ))}
          <p>
            <button disabled={loading || data.page === 1} onClick={() => void load(data.page - 1)}>
              Previous projects
            </button>{' '}
            <button
              disabled={loading || data.page * data.pageSize >= data.total}
              onClick={() => void load(data.page + 1)}
            >
              Next projects
            </button>
          </p>
        </>
      )}
      {detail && (
        <article className="road-evidence-case">
          <h5>{detail.project.workId}</h5>
          {detail.project.textReview ? (
            <p>
              Some source text has encoding faults. Original bytes are preserved; interpret names
              and purpose only after review.
            </p>
          ) : (
            detail.project.titles.map((t) => <p key={t}>{t}</p>)
          )}
          <p>Implementing agencies: {detail.project.agencies.join('; ')}</p>
          <p>
            Source expenditure rows; amounts are not a verified payment total. The displayed date is
            the source expenditure date, and “Payment Success” is the portal status.
          </p>
          {detail.rows.map((r, i) => (
            <div key={i}>
              <p>
                <strong>{sourceRupees(r.amount)}</strong> · {r.date ?? 'Date unavailable'}
                <br />
                {r.encodingIssue
                  ? 'Text has an encoding issue; inspect original before interpreting recipient.'
                  : r.recipient}{' '}
                · {r.status}
                <br />
                <small>
                  Preserved original SHA-256: {r.sourceHash} · Source row {r.sourceRow}; not a
                  transaction identifier.
                </small>
              </p>
            </div>
          ))}
          <p>
            Rows {detail.total ? (detail.page - 1) * 25 + 1 : 0}–
            {Math.min(detail.page * 25, detail.total)} of {detail.total}. Repeated rows are retained
            until actual payment references establish duplicates or reversals.
          </p>
          <button
            disabled={loading || detail.page === 1}
            onClick={() => void load(detail.page - 1, selected)}
          >
            Previous rows
          </button>{' '}
          <button
            disabled={loading || detail.page * 25 >= detail.total}
            onClick={() => void load(detail.page + 1, selected)}
          >
            Next rows
          </button>
          <p>
            Map location, contract, completion evidence, gross/net definitions and individual
            payment references are not established by this catalogue. The five separately reviewed
            pilot receipts contain additional documents.
          </p>
        </article>
      )}
    </section>
  );
}
