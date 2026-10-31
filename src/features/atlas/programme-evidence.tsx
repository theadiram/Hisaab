'use client';
import { useState } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import type { DevelopmentRecord } from '@/lib/development';
import { formatMoney, formatExactMoney } from '@/lib/money';
import { measures, origins } from './labels';

export function Programme({ record: r }: { record: DevelopmentRecord }) {
  const [history, setHistory] = useState<DevelopmentRecord[]>([]),
    [error, setError] = useState('');
  return (
    <>
      <h2>{r.programme}</h2>
      <div className="atlas-transfer-amount">{formatMoney(r.amountRupees)}</div>
      <p>
        {measures[r.measure]} · FY {r.financialYear} ·{' '}
        {r.scope === 'received' ? 'Funding received' : 'Development within the area'}
      </p>
      <dl>
        <dt>Exact amount</dt>
        <dd>{formatExactMoney(r.amountRupees)}</dd>
        <dt>Funding origin</dt>
        <dd>{origins[r.origin]}</dd>
        <dt>Ministry / authority</dt>
        <dd>{r.ministry}</dd>
        <dt>Channel and instrument</dt>
        <dd>
          {r.channel.replaceAll('_', ' ')} · {r.instrument.replaceAll('_', ' ')}
        </dd>
        <dt>Accounting basis</dt>
        <dd>{r.accountingBasis.replaceAll('_', ' ')}</dd>
        <dt>Reporting period</dt>
        <dd>
          {r.periodStart} — {r.periodEnd}
        </dd>
        <dt>Source cutoff</dt>
        <dd>{r.cutoff}</dd>
        <dt>Publication date</dt>
        <dd>{r.publicationDate ?? 'Unavailable'}</dd>
        <dt>Original table</dt>
        <dd>{r.source.locator}</dd>
      </dl>
      <p>{r.notes}</p>
      <a
        href={r.source.url + (r.source.page ? '#page=' + r.source.page : '')}
        target="_blank"
        rel="noopener noreferrer"
      >
        Original document <ExternalLink size={13} />
      </a>
      <button
        className="atlas-text-button"
        onClick={() => {
          void fetch(
            '/api/v1/development/programmes/' +
              encodeURIComponent(r.programmeId) +
              '?' +
              new URLSearchParams({ scope: r.jurisdiction }),
          )
            .then(async (response) => {
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setHistory(result.history.map((x: DevelopmentRecord) => x));
            })
            .catch((e) => setError(e.message));
        }}
      >
        Open funding history <ArrowRight size={14} />
      </button>
      {error && <p role="status">{error}</p>}
      {history.map((x) => (
        <article className="atlas-history" key={x.id}>
          <strong>
            {x.financialYear} · {measures[x.measure]}
          </strong>
          <p>
            {formatMoney(x.amountRupees)} · {x.estimate.replaceAll('_', ' ')}
          </p>
          <a href={x.source.url} target="_blank" rel="noopener noreferrer">
            Original evidence
          </a>
        </article>
      ))}
    </>
  );
}
