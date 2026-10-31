'use client';
import { useState } from 'react';
export type BudgetColumnInterpretation = {
  parserVersion?: string;
  sourceUnit: string;
  labelFragment: string;
  missingNotation: string;
  reconciliation: string;
  columns: {
    measure: string;
    financialYear: string;
    totalRupees: string | null;
    components: { [key: string]: string | null };
  }[];
};
export function FundingBudgetDraft({
  rowId,
  classification,
  interpretation,
}: {
  rowId: string;
  classification: string;
  interpretation: BudgetColumnInterpretation;
}) {
  const [column, setColumn] = useState(3),
    [programmeId, setProgrammeId] = useState(''),
    [programme, setProgramme] = useState(''),
    [budgetHead, setBudgetHead] = useState(''),
    [ministry, setMinistry] = useState(''),
    [channel, setChannel] = useState('other'),
    [instrument, setInstrument] = useState('unresolved'),
    [coverageKey, setCoverageKey] = useState(''),
    [parentKey, setParentKey] = useState(''),
    [aggregation, setAggregation] = useState('context'),
    [cutoff, setCutoff] = useState(''),
    [publicationDate, setPublicationDate] = useState(''),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function draft() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/funding/budget-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rowId,
          parserVersion: interpretation.parserVersion,
          column,
          reason,
          metadata: {
            programmeId,
            programme,
            budgetHead,
            ministry,
            channel,
            instrument,
            coverageKey,
            parentKey: parentKey || null,
            aggregation,
            cutoff,
            publicationDate: publicationDate || null,
            confirmed,
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(
        'Private funding fact created. Open Funding facts for its separate rights and publication review.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const ready =
    classification === 'included' &&
    interpretation.parserVersion &&
    interpretation.columns[column]?.totalRupees !== null &&
    programmeId.trim() &&
    programme.trim() &&
    budgetHead.trim() &&
    ministry.trim() &&
    coverageKey.trim() &&
    cutoff &&
    reason.trim().length >= 30 &&
    confirmed;
  return (
    <details>
      <summary>Draft a national funding fact from a verified column</summary>
      <p>
        First save the row as included development. Confirm the exact programme and budget head from
        the original page and neighbouring hierarchy. Department totals, subtotals and mixed
        maintenance do not become additive development facts. This step creates a private draft;
        source permission and evidence review remain separate.
      </p>
      <label className="field">
        Original fiscal column
        <select value={column} onChange={(e) => setColumn(Number(e.target.value))}>
          {interpretation.columns.map((c, i) => (
            <option key={i} value={i}>
              {c.measure.replaceAll('_', ' ')} · {c.financialYear}
            </option>
          ))}
        </select>
      </label>
      {[
        ['Official programme identifier', programmeId, setProgrammeId],
        ['Programme name from original', programme, setProgramme],
        ['Official budget head', budgetHead, setBudgetHead],
        ['Funding ministry / department', ministry, setMinistry],
        ['Documented accounting scope identity', coverageKey, setCoverageKey],
        ['Parent scope identity, if documented', parentKey, setParentKey],
      ].map(([label, value, set]) => (
        <label className="field" key={label as string}>
          {label as string}
          <input
            value={value as string}
            maxLength={label === 'Programme name from original' ? 400 : 200}
            onChange={(e) => (set as (s: string) => void)(e.target.value)}
          />
        </label>
      ))}
      <label className="field">
        Funding channel
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          {[
            'central_sector',
            'centrally_sponsored',
            'development_grant',
            'capital_loan',
            'finance_commission',
            'disaster_grant',
            'other',
          ].map((v) => (
            <option key={v} value={v}>
              {v.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Instrument
        <select value={instrument} onChange={(e) => setInstrument(e.target.value)}>
          {['unresolved', 'grant', 'loan', 'direct_expenditure'].map((v) => (
            <option key={v} value={v}>
              {v.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Hierarchy role
        <select value={aggregation} onChange={(e) => setAggregation(e.target.value)}>
          <option value="context">Context / parent subtotal</option>
          <option value="leaf">Additive leaf with documented scope</option>
        </select>
      </label>
      <label className="field">
        Source reporting cutoff
        <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
      </label>
      <label className="field">
        Source publication date, if known
        <input
          type="date"
          value={publicationDate}
          onChange={(e) => setPublicationDate(e.target.value)}
        />
      </label>
      <label className="field">
        Programme identity, fiscal-column and hierarchy evidence
        <textarea
          maxLength={2000}
          minLength={30}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="funding-check">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I checked this row against the original and its surrounding hierarchy.
      </label>
      <p>
        State attribution is fixed to Nationwide / state breakdown unavailable. Original actuals
        mean Union booked expenditure; they do not establish recipient use.
      </p>
      <button disabled={busy || !ready} onClick={() => void draft()}>
        Create private funding draft
      </button>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
