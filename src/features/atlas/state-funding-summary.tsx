'use client';
import { ChevronRight } from 'lucide-react';
import type { DevelopmentOverview, DevelopmentRecord } from '@/lib/development';
import type { Exploration } from '@/lib/exploration';
import { formatMoney } from '@/lib/money';
import { JurisdictionSourceInventory } from '@/components/jurisdiction-source-inventory';
import { measures, origins } from './labels';
type Props = {
  name: string;
  area: DevelopmentOverview['states'][number] | undefined;
  busy: boolean;
  year: string;
  measure: Exploration['measure'];
  onPurpose: (purpose: string) => void;
  onProgramme: (record: DevelopmentRecord) => void;
};
export function StateFundingSummary({
  name,
  area,
  busy,
  year,
  measure,
  onPurpose,
  onProgramme,
}: Props) {
  return (
    <>
      <h1>{name}</h1>
      <p className="atlas-caption">
        FY {year.slice(0, 4)}–{year.slice(-2)} · {measures[measure]}
      </p>
      <JurisdictionSourceInventory jurisdiction={name} />
      <h3>Development within this state</h3>
      <div className="atlas-amount">
        {busy ? 'Loading…' : formatMoney(area?.development.combinedAmountRupees ?? null)}
      </div>
      <p className="atlas-caption">
        {area?.development.combinedAvailable
          ? 'Reviewed records · partial coverage'
          : 'A reconciled combined amount is not available.'}
      </p>
      <div className="atlas-origin-grid">
        {Object.entries(origins).map(([key, label]) => (
          <div key={key}>
            <small>{label}</small>
            <strong>
              {formatMoney(
                area?.development.origins.find((o) => o.origin === key)?.amountRupees ?? null,
              )}
            </strong>
          </div>
        ))}
      </div>
      <h3>Funding received by the state</h3>
      <div className="atlas-transfer-amount">
        {formatMoney(area?.received.amountRupees ?? null)}
      </div>
      <p className="atlas-caption">
        Recorded transfers/programme funding. Separate from downstream spending.
      </p>
      <h3>By purpose</h3>
      {area?.purposes
        .filter((p) => p.records)
        .map((p) => (
          <button className="atlas-breakdown-row" key={p.id} onClick={() => onPurpose(p.id)}>
            <span>{p.name}</span>
            <strong>{formatMoney(p.amountRupees)}</strong>
          </button>
        ))}
      {!area?.purposes.some((p) => p.records) && (
        <p className="atlas-caption">
          Purpose-linked development evidence is still being acquired.
        </p>
      )}
      <h3>Programmes and evidence</h3>
      {area?.records.map((r) => (
        <button className="atlas-programme-row" key={r.id} onClick={() => onProgramme(r)}>
          <div>
            <strong>{r.programme}</strong>
            <small>
              {r.scope === 'received' ? 'Funding received' : 'Development within the state'} ·{' '}
              {origins[r.origin]}
            </small>
          </div>
          <span>
            {formatMoney(r.amountRupees)}
            <ChevronRight size={14} />
          </span>
        </button>
      ))}
    </>
  );
}
