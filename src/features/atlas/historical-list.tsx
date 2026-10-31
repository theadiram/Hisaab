'use client';
import { useState, useEffect } from 'react';
import type { AssetDetail } from '@/lib/asset-geography';

export function HistoricalList({
  bounds,
  query,
  purpose,
  onSelect,
}: {
  bounds: number[];
  query: string;
  purpose: string;
  onSelect: (a: AssetDetail) => void;
}) {
  const [offset, setOffset] = useState(0),
    [records, setRecords] = useState<{
      total: number;
      assets: { id: string; title: string; state: string; kind: string }[];
    } | null>(null),
    [error, setError] = useState(''),
    [opened, setOpened] = useState(false);
  const bbox = bounds.join(',');
  useEffect(() => setOffset(0), [bbox, query, purpose]);
  useEffect(() => {
    if (!opened) return;
    setRecords(null);
    setError('');
    if (purpose === 'No matching project category') {
      setRecords({ total: 0, assets: [] });
      return;
    }
    const c = new AbortController(),
      p = new URLSearchParams({ bbox, q: query, mode: 'members', offset: String(offset) });
    const kind =
      purpose === 'Roads'
        ? 'road'
        : purpose === 'Schools & education'
          ? 'education'
          : purpose === 'Hospitals & health'
            ? 'health'
            : null;
    if (kind) p.set('kind', kind);
    void fetch('/api/v1/map/assets?' + p, { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error('Historical locations unavailable');
        setRecords(await r.json());
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [opened, bbox, query, purpose, offset]);
  return (
    <details className="atlas-history-list" onToggle={(e) => setOpened(e.currentTarget.open)}>
      <summary>Browse historical locations in view</summary>
      <p className="atlas-caption">
        Archived facilities and road proposals, independent of the financial year. No spending link
        is implied.
      </p>
      {error && <p role="status">{error}</p>}
      {!records && !error && <p role="status">Loading locations…</p>}
      {records?.assets.map((a) => (
        <button
          className="atlas-programme-row"
          key={a.id}
          onClick={() => {
            void fetch('/api/v1/assets/' + encodeURIComponent(a.id))
              .then(async (r) => {
                if (!r.ok) throw new Error('Original location unavailable');
                onSelect((await r.json()).asset);
              })
              .catch((e) => setError(e.message));
          }}
        >
          <strong>{a.title}</strong>
          <small>
            {a.state} · {a.kind}
          </small>
        </button>
      ))}
      {records && (
        <div className="atlas-pagination">
          <button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 25))}>
            Previous locations
          </button>
          <small>
            {records.total ? offset + 1 : 0}–{Math.min(offset + 25, records.total)} of{' '}
            {records.total.toLocaleString('en-IN')}
          </small>
          <button disabled={offset + 25 >= records.total} onClick={() => setOffset((n) => n + 25)}>
            Next locations
          </button>
        </div>
      )}
    </details>
  );
}
