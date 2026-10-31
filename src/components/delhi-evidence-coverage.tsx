'use client';

import { useId, useState } from 'react';

export type DelhiCoverage = {
  updatedOn: string;
  status: 'incomplete';
  period: {
    closedFinancialYear: string;
    currentFinancialYear: string;
    cutoff: string;
  };
  authorityInventoryComplete: false;
  knownAuthorities: number;
  knownUnits: number;
  completeUnits: number;
  completePaymentCards: number;
  authorities: Array<{
    id: string;
    name: string;
    level: string;
    rosterStatus: 'pending' | 'partial' | 'verified';
    expectedUnits: number | null;
    units: Array<{
      id: string;
      name: string;
      workRegister: 'missing' | 'partial' | 'verified';
      paymentRegister: 'missing' | 'partial' | 'verified';
      reconciliation: 'pending' | 'verified';
      geography: 'missing' | 'partial' | 'verified';
      publication: 'pending' | 'reviewed';
      nextAction: string;
    }>;
    nextAction: string;
    sourceUrl: string;
  }>;
};

const count = (value: number) => value.toLocaleString('en-IN');
const evidenceLabel = {
  missing: 'Missing evidence',
  partial: 'Partial evidence',
  verified: 'Verified',
  pending: 'Pending',
  reviewed: 'Reviewed',
} as const;
const rosterLabel = {
  pending: 'Not established',
  partial: 'Partially established',
  verified: 'Verified',
} as const;

function dateLabel(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
}

function yearLabel(value: string) {
  return /^FY\s/i.test(value) ? value : `FY ${value}`;
}

export function DelhiEvidenceCoverage({ data }: { data: DelhiCoverage }) {
  const headingId = useId();
  const checklistId = useId();
  const selectId = useId();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const entries = data.authorities.flatMap((authority) =>
    authority.units.map((unit) => ({
      authority,
      unit,
      key: `${authority.id}/${unit.id}`,
    })),
  );
  const selected =
    entries.find((entry) => entry.key === selectedKey) ??
    entries.find((entry) => entry.authority.id === 'pwd' && entry.unit.id === 'pwd-ser2') ??
    entries[0];

  return (
    <section className="national-evidence-coverage" aria-labelledby={headingId}>
      <h3 id={headingId}>Delhi evidence coverage</h3>
      <p>
        <strong>Whole Delhi is not yet complete</strong>
      </p>
      <small>Updated {dateLabel(data.updatedOn)}</small>
      <p>
        Closed year: {yearLabel(data.period.closedFinancialYear)}. Current year:{' '}
        {yearLabel(data.period.currentFinancialYear)}, through {dateLabel(data.period.cutoff)}.
      </p>
      <p>
        The complete authority roster and the total number of units across Delhi are{' '}
        <strong>Not established</strong>. Counts below cover only the authorities and units
        identified so far.
      </p>
      <div
        className="spending-summary"
        style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}
      >
        <div>
          <strong>{count(data.knownAuthorities)}</strong>
          <span>Authorities and operators tracked</span>
        </div>
        <div>
          <strong>{count(data.knownUnits)}</strong>
          <span>Units identified so far</span>
        </div>
        <div>
          <strong>{count(data.completeUnits)}</strong>
          <span>Identified units with complete evidence</span>
        </div>
        <div>
          <strong>{count(data.completePaymentCards)}</strong>
          <span>Complete payment cards in this inventory</span>
        </div>
      </div>

      {selected ? (
        <section className="road-evidence-case" aria-labelledby={checklistId}>
          <h4 id={checklistId}>Selected unit: {selected.unit.name}</h4>
          <p>{selected.authority.name}</p>
          {selected.unit.id === 'pwd-ser2' && (
            <p>First pilot: South East Road Division 2 (SER-2).</p>
          )}
          {entries.length > 1 && (
            <div className="field">
              <label htmlFor={selectId}>Review a known unit</label>
              <select
                id={selectId}
                value={selected.key}
                onChange={(event) => setSelectedKey(event.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 7, padding: 10 }}
              >
                {data.authorities
                  .filter((authority) => authority.units.length > 0)
                  .map((authority) => (
                    <optgroup key={authority.id} label={authority.name}>
                      {authority.units.map((unit) => (
                        <option key={unit.id} value={`${authority.id}/${unit.id}`}>
                          {unit.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
              </select>
            </div>
          )}
          <dl aria-label="Selected unit evidence checklist">
            <div>
              <dt>Work register</dt>
              <dd>{evidenceLabel[selected.unit.workRegister]}</dd>
            </div>
            <div>
              <dt>Bill and payment register</dt>
              <dd>{evidenceLabel[selected.unit.paymentRegister]}</dd>
            </div>
            <div>
              <dt>Reconciled register totals</dt>
              <dd>{evidenceLabel[selected.unit.reconciliation]}</dd>
            </div>
            <div>
              <dt>Official work locations</dt>
              <dd>{evidenceLabel[selected.unit.geography]}</dd>
            </div>
            <div>
              <dt>Publication review</dt>
              <dd>{evidenceLabel[selected.unit.publication]}</dd>
            </div>
          </dl>
          <p>
            <strong>Next:</strong> {selected.unit.nextAction}
          </p>
        </section>
      ) : (
        <p>No implementing units have been identified in this inventory yet.</p>
      )}

      <details>
        <summary>View {count(data.knownAuthorities)} identified authorities and operators</summary>
        <p>
          Government-funded work is the core scope. Utilities and concession operators require a
          confirmed public-spending basis and Delhi allocation.
        </p>
        {data.authorities.map((authority) => (
          <details className="road-evidence-case" key={authority.id}>
            <summary>{authority.name}</summary>
            <p>{authority.level}</p>
            <dl>
              <div>
                <dt>Unit roster</dt>
                <dd>{rosterLabel[authority.rosterStatus]}</dd>
              </div>
              <div>
                <dt>Expected implementing units</dt>
                <dd>
                  {authority.expectedUnits === null
                    ? 'Not established'
                    : count(authority.expectedUnits)}
                </dd>
              </div>
              <div>
                <dt>Units identified so far</dt>
                <dd>{count(authority.units.length)}</dd>
              </div>
            </dl>
            {authority.units.length > 0 ? (
              <ul>
                {authority.units.map((unit) => (
                  <li key={unit.id}>{unit.name}</li>
                ))}
              </ul>
            ) : (
              <p>The implementing-unit roster still needs to be established.</p>
            )}
            <p>
              <strong>Next:</strong> {authority.nextAction}
            </p>
            <p>
              <a href={authority.sourceUrl} target="_blank" rel="noopener noreferrer">
                Official authority source (opens in a new tab)
              </a>
            </p>
          </details>
        ))}
      </details>
      <p>
        Discovery remains open for school and health owners, other institutional estates and defence
        works. Client and executing-agency records can describe the same project and must be
        connected before totals are counted.
      </p>
      <p>Missing evidence does not establish that no work or payment occurred.</p>
    </section>
  );
}
