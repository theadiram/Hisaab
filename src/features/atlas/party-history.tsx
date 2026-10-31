'use client';
import { useState, useEffect } from 'react';
import type { Work, PartyRole } from '@/lib/model';
import { ProjectList } from './project-list';

export function PartyHistory({
  party,
  year,
  onSelect,
}: {
  party: PartyRole;
  year: string;
  onSelect: (w: Work) => void;
}) {
  const [works, setWorks] = useState<Work[]>([]),
    [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    if (!party.identityBasis) return;
    const c = new AbortController();
    void fetch(
      '/api/v1/parties/' +
        encodeURIComponent(party.id) +
        '?' +
        new URLSearchParams({ year, offset: String(offset) }),
      { signal: c.signal },
    )
      .then(async (r) => {
        if (!r.ok) throw new Error('Documented history unavailable');
        const data = await r.json();
        setWorks(data.works);
        setTotal(data.total);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [party.id, party.identityBasis, year, offset]);
  return (
    <section>
      <h3>Previous five financial years</h3>
      <p className="atlas-caption">
        {party.identityBasis
          ? 'Only reviewed projects connected by the documented official identity appear. Coverage is partial.'
          : 'A stable cross-project identity is not established. History cannot be matched by name alone.'}
      </p>
      {party.identityBasis && (
        <>
          <ProjectList works={works} error={error} onSelect={onSelect} />
          <div className="atlas-pagination">
            <button disabled={!offset} onClick={() => setOffset((n) => Math.max(0, n - 25))}>
              Previous
            </button>
            <small>{total.toLocaleString('en-IN')} documented projects</small>
            <button disabled={offset + 25 >= total} onClick={() => setOffset((n) => n + 25)}>
              Next
            </button>
          </div>
        </>
      )}
    </section>
  );
}
