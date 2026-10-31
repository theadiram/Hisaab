'use client';
import { FundingSourceLedger, type FundingSourceLedgerData } from './funding-source-ledger';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowLeft, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import {
  fundingYears,
  fundingStates,
  fundingPurposes,
  fundingMeasures,
  type FundingOverview,
  type FundingRecord,
  type FundingSelection,
  type FundingTotal,
} from '@/lib/funding';
import { formatMoney, formatExactMoney } from '@/lib/money';
type StateEvidence = {
  state: FundingOverview['states'][number];
  records: FundingRecord[];
  purposes: FundingOverview['purposes'];
  total: number;
  nextOffset: number | null;
  history: FundingRecord[];
};
const labels = { allocated: 'Allocated', released: 'Released', reported_spent: 'Reported spent' };
export function FundingAtlas({
  active,
  selected,
  onSelect,
  onOverview,
  onEvidence,
}: {
  active: boolean;
  selected: string | null;
  onSelect: (code: string | null) => void;
  onOverview: (data: FundingOverview | null) => void;
  onEvidence: () => void;
}) {
  const [year, setYear] = useState('2026-2027'),
    [measure, setMeasure] = useState<FundingSelection['measure']>('allocated'),
    [purpose, setPurpose] = useState('all'),
    [basis, setBasis] = useState('union'),
    [estimate, setEstimate] = useState('original'),
    [query, setQuery] = useState(''),
    [data, setData] = useState<FundingOverview | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0),
    [detail, setDetail] = useState<StateEvidence | null>(null),
    [detailError, setDetailError] = useState(''),
    [detailLoading, setDetailLoading] = useState(false),
    [offset, setOffset] = useState(0),
    [programme, setProgramme] = useState<string | null>(null),
    [nationalOpen, setNationalOpen] = useState(false),
    [ledger, setLedger] = useState<{
      editions: { financialYear: string; demands: number; lines: number; status: string }[];
      disasterRecords: number;
      columnInterpretations?: { privateRows: number; quarantinedRows: number } | null;
      boundary: { status: string };
      gaps: string[];
      sourceLedger?: FundingSourceLedgerData;
    } | null>(null);
  const reduced = useReducedMotion(),
    panel = useRef<HTMLElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const params = new URLSearchParams({ year, measure, purpose, basis, estimate });
  const selection = params.toString();
  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    setLoading(true);
    setData(null);
    onOverview(null);
    setError('');
    void fetch('/api/v1/funding?' + selection, { signal: c.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setData(result);
        onOverview(result);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [active, selection, retry, onOverview]);
  useEffect(() => {
    if (!active) return;
    const c = new AbortController();
    setLedger(null);
    void fetch('/api/v1/funding/coverage?year=' + year, { signal: c.signal })
      .then(async (r) => {
        if (r.ok) setLedger(await r.json());
      })
      .catch(() => {});
    return () => c.abort();
  }, [active, retry, year]);
  useEffect(() => {
    setOffset(0);
    setProgramme(null);
  }, [selected, selection]);
  useEffect(() => {
    if (!active || !selected) return;
    const c = new AbortController();
    setDetail(null);
    setDetailError('');
    setDetailLoading(true);
    const p = new URLSearchParams(selection);
    p.set('offset', String(offset));
    if (programme) p.set('programme', programme);
    void fetch('/api/v1/funding/states/' + selected + '?' + p, { signal: c.signal })
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        setDetail(result);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setDetailError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setDetailLoading(false);
      });
    return () => c.abort();
  }, [active, selected, selection, offset, programme, retry]);
  useEffect(() => {
    if (active && selected) {
      if (
        document.activeElement instanceof HTMLElement &&
        !panel.current?.contains(document.activeElement)
      )
        returnFocus.current = document.activeElement;
      panel.current?.focus({ preventScroll: true });
      const esc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onSelect(null);
      };
      window.addEventListener('keydown', esc);
      return () => {
        window.removeEventListener('keydown', esc);
        if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true });
      };
    }
  }, [selected, active, onSelect]);
  if (!active) return null;
  const state = fundingStates.find((s) => s.code === selected),
    stateRows = fundingStates.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="funding-atlas">
      <div className="funding-toolbar">
        <div className="funding-stage" role="group" aria-label="Funding measure">
          {fundingMeasures.map((m) => (
            <button
              key={m}
              aria-pressed={measure === m}
              onClick={() => {
                setMeasure(m);
                setBasis('union');
                setEstimate('original');
              }}
            >
              {labels[m]}
            </button>
          ))}
        </div>
        <label className="funding-year">
          Financial year
          <select
            aria-label="Funding financial year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {fundingYears.map((y) => (
              <option key={y} value={y}>
                FY {y.slice(0, 4)}–{y.slice(-2)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <section className="funding-overview" aria-labelledby="funding-title">
        <div className="eyebrow">
          FUNDING ATLAS <span>/</span> UNION → STATE → PURPOSE
        </div>
        <h1 id="funding-title">Union development funding</h1>
        <p>Follow the funding. Open its evidence.</p>
        <div className="funding-headline" aria-live="polite">
          {loading ? 'Loading…' : data ? formatMoney(data.national.amountRupees) : 'Unavailable'}
        </div>
        <p className="funding-caption">
          {labels[measure]} · FY {year.slice(0, 4)}–{year.slice(-2)} ·{' '}
          {data?.national.records
            ? 'Reviewed records · partial coverage'
            : 'No reviewed amount available'}
        </p>
        {error && (
          <div className="funding-error" role="status">
            {error}
            <button onClick={() => setRetry((n) => n + 1)}>Retry funding service</button>
          </div>
        )}
        {data && data.national.records > 0 && (
          <div className="funding-coverage-summary">
            <strong>
              Current coverage:{' '}
              {data.purposes
                .filter((p) => p.records)
                .map((p) => p.name)
                .join(', ')}
            </strong>
            <span>
              {data.coverage.statesWithRecords} of 36 states/UTs · {data.national.records} reviewed
              funding facts
            </span>
            <small>This total covers the recorded subset. Other funding remains unknown.</small>
          </div>
        )}
        <label className="funding-purpose">
          Purpose
          <select
            aria-label="Funding purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          >
            <option value="all">All development purposes</option>
            {Object.entries(fundingPurposes).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {measure === 'allocated' && (
          <label className="funding-purpose">
            Budget edition
            <select
              aria-label="Budget estimate edition"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
            >
              <option value="original">Original estimates / allocations</option>
              <option value="revised">Revised estimates</option>
            </select>
          </label>
        )}
        {measure === 'reported_spent' && (
          <label className="funding-purpose">
            Accounting view
            <select
              aria-label="Reported spending accounting view"
              value={basis}
              onChange={(e) => setBasis(e.target.value)}
            >
              <option value="union">Union booked expenditure</option>
              <option value="recipient">Recipient-reported utilisation</option>
            </select>
          </label>
        )}
        <p className="funding-scope">
          {data?.accountingNote ??
            'Allocations, releases and expenditure are separate stages. Unavailable never means zero.'}
        </p>
        {data && (
          <>
            <InstrumentTotals total={data.national} />
            <p className="funding-scope">
              Earliest source cutoff in this recorded subset:{' '}
              {data.national.cutoff ?? 'Not available'}.
            </p>
          </>
        )}
        <button
          className="funding-unassigned"
          aria-expanded={nationalOpen}
          onClick={() => setNationalOpen((v) => !v)}
        >
          <div>
            <strong>Nationwide / state breakdown unavailable</strong>
            <span>{data ? formatMoney(data.unassigned.amountRupees) : 'Not available'}</span>
          </div>
          <ChevronRight size={17} />
        </button>
        {nationalOpen && (
          <div className="funding-gap">
            National programme amounts stay here until the source provides a state split. We never
            divide them using population or location guesses.{' '}
            {data?.unassigned.records === 0
              ? 'No reviewed national records for this selection.'
              : ''}
            {data?.unassignedProgrammes.map((r) => (
              <NationalProgramme key={r.id} record={r} />
            ))}
          </div>
        )}
        {Boolean(data?.historicalProgrammes.length) && (
          <details className="funding-gap">
            <summary>Historical combined jurisdictions · not split between today’s states</summary>
            {data?.historicalProgrammes.map((r) => (
              <div key={r.id}>
                <strong>{r.jurisdictionLabel}</strong>
                <NationalProgramme record={r} />
              </div>
            ))}
          </details>
        )}
        <div className="funding-states-heading">
          <h2>Choose a state or UT</h2>
          <span>{data?.coverage.statesWithRecords ?? '—'} / 36 with reviewed records</span>
        </div>
        <label className="funding-state-search">
          <Search size={16} />
          <input
            aria-label="Search funding states"
            placeholder="Search states and UTs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="funding-state-list" id="funding-states" aria-label="State funding list">
          {stateRows.map((s) => {
            const t = data?.states.find((r) => r.code === s.code);
            return (
              <button
                key={s.code}
                aria-pressed={selected === s.code}
                onClick={() => onSelect(s.code)}
              >
                <span>{s.name}</span>
                <small>
                  {t?.amountRupees !== null && t?.amountRupees !== undefined
                    ? formatMoney(t.amountRupees)
                    : 'Not available'}
                </small>
                <ChevronRight size={14} />
              </button>
            );
          })}
          {!stateRows.length && <p>No matching jurisdiction.</p>}
        </div>
        <details className="funding-progress">
          <summary>Evidence coverage · eleven financial years</summary>
          <p>Collected originals remain private until source rights and fact reviews pass.</p>
          {ledger ? (
            <>
              <p>
                {ledger.disasterRecords.toLocaleString('en-IN')} preserved disaster-funding
                candidates. Reviewed counts for the selected year appear in the source queue.
              </p>
              {ledger.columnInterpretations && (
                <p>
                  {ledger.columnInterpretations.privateRows.toLocaleString('en-IN')} private
                  fiscal-column interpretations; {ledger.columnInterpretations.quarantinedRows}{' '}
                  component discrepancies quarantined. These are not additive programme counts.
                </p>
              )}
              {ledger.editions.map((e) => (
                <div key={e.financialYear}>
                  <strong>{e.financialYear}</strong>
                  <small>
                    {e.demands} demands · {e.lines.toLocaleString('en-IN')} inventoried rows ·{' '}
                    {e.status.replaceAll('_', ' ')}
                  </small>
                </div>
              ))}
              <p>State polygons: {ledger.boundary.status.replaceAll('_', ' ')}</p>
              {ledger.gaps.map((g) => (
                <p key={g}>{g}</p>
              ))}
              {ledger.sourceLedger && (
                <FundingSourceLedger ledger={ledger.sourceLedger} year={year} />
              )}
            </>
          ) : (
            <p>Coverage ledger is unavailable. No completeness claim is made.</p>
          )}
          <a href="/admin/funding">Open owner funding review ↗</a>
        </details>
        <button className="funding-evidence-button" onClick={onEvidence}>
          Evidence progress &amp; project acquisition <ChevronRight size={16} />
        </button>
      </section>
      <div className="funding-map-key">
        <span className="funding-gradient" />
        Lower → higher recorded funding <span className="funding-empty-key" />
        Unavailable / partial coverage
      </div>
      <AnimatePresence>
        {state && (
          <motion.aside
            ref={panel}
            tabIndex={-1}
            className="funding-state-panel"
            aria-labelledby="funding-state-title"
            initial={{ opacity: 0, x: reduced ? 0 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : 24 }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 39 }}
          >
            <div className="funding-panel-top">
              <button
                aria-label="Back to state funding"
                onClick={() => {
                  if (programme) setProgramme(null);
                  else onSelect(null);
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <span className="eyebrow">{programme ? 'PROGRAMME EVIDENCE' : 'STATE FUNDING'}</span>
              <button aria-label="Close state funding" onClick={() => onSelect(null)}>
                <X size={18} />
              </button>
            </div>
            <h2 id="funding-state-title">{state.name}</h2>
            <p>
              Union funding · FY {year.slice(0, 4)}–{year.slice(-2)}
            </p>
            <div className="funding-state-amount">
              {detailLoading
                ? 'Loading…'
                : detail
                  ? formatMoney(detail.state.amountRupees)
                  : 'Not available'}
            </div>
            <p className="funding-caption">
              {labels[measure]} ·{' '}
              {detailLoading
                ? 'Loading reviewed programmes…'
                : detail?.state.records
                  ? 'Recorded programmes · partial coverage'
                  : 'No reviewed records for this selection'}
            </p>
            {detailError && (
              <p role="status" className="funding-error">
                {detailError}
              </p>
            )}
            {detail && (
              <>
                <InstrumentTotals total={detail.state} />
                <h3>By purpose</h3>
                {detail.purposes
                  .filter((p) => p.records)
                  .map((p) => (
                    <button
                      className="funding-purpose-row"
                      key={p.id}
                      onClick={() => setPurpose(p.id)}
                    >
                      <span>{p.name}</span>
                      <strong>{formatMoney(p.amountRupees)}</strong>
                    </button>
                  ))}
                <h3>{programme ? 'Funding history and evidence' : 'Programmes and sources'}</h3>
                {detail.records.map((r) => (
                  <FundingEvidence
                    key={r.id}
                    record={r}
                    onHistory={() => {
                      setProgramme(r.programmeId);
                      setOffset(0);
                    }}
                  />
                ))}
                {programme &&
                  detail.history.map((r) => <FundingEvidence key={'history-' + r.id} record={r} />)}
                {detail.nextOffset !== null && (
                  <button onClick={() => setOffset(detail.nextOffset!)}>Next programmes</button>
                )}
                {offset > 0 && (
                  <button onClick={() => setOffset((n) => Math.max(0, n - 20))}>
                    Previous programmes
                  </button>
                )}
              </>
            )}
            <div className="funding-gap">
              <strong>
                {detailLoading ? 'Loading state evidence…' : 'What is still missing?'}
              </strong>
              <p>
                {detailLoading
                  ? 'Fetching the reviewed records for this selection.'
                  : detail?.total
                    ? 'This is the reviewed subset. Other programme allocations, release histories and recipient expenditure may be missing.'
                    : 'Programme allocations, releases and utilisation have not yet passed publication review for this selection.'}
              </p>
              <p>
                Location records and national totals do not establish this state’s funding. Missing
                amounts stay unknown.
              </p>
              <p>
                Source cutoff: {detail?.state.cutoff ?? 'Not available'}. No contractor-payment
                coverage is implied.
              </p>
            </div>
            <button className="funding-evidence-button" onClick={onEvidence}>
              See acquisition progress <ChevronRight size={16} />
            </button>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
function InstrumentTotals({ total }: { total: FundingTotal }) {
  return (
    <div className="funding-instruments">
      {[
        ['Grants', total.grantsRupees],
        ['Loans', total.loansRupees],
        ['Direct expenditure', total.directRupees],
      ].map(([label, value]) => (
        <div key={label}>
          <small>{label}</small>
          <strong>{formatMoney(value)}</strong>
        </div>
      ))}
    </div>
  );
}
function FundingEvidence({
  record: r,
  onHistory,
}: {
  record: FundingRecord;
  onHistory?: () => void;
}) {
  return (
    <article className="funding-programme">
      <h4>{r.programme}</h4>
      <strong>{formatMoney(r.amountRupees)}</strong>
      <p>
        {labels[r.measure]} · {r.financialYear} · {r.estimate.replaceAll('_', ' ')}
      </p>
      <dl>
        <dt>Exact source amount (INR)</dt>
        <dd>{formatExactMoney(r.amountRupees)}</dd>
        <dt>Ministry</dt>
        <dd>{r.ministry}</dd>
        <dt>Channel / Union share</dt>
        <dd>
          {r.channel.replaceAll('_', ' ')} · {r.instrument} · {r.share}
        </dd>
        <dt>Accounting basis</dt>
        <dd>{r.accountingBasis.replaceAll('_', ' ')}</dd>
        <dt>Reporting period</dt>
        <dd>
          {r.periodStart} — {r.periodEnd}
        </dd>
        <dt>Cutoff / publication date</dt>
        <dd>
          {r.cutoff} / {r.publicationDate ?? 'Unknown'}
        </dd>
        <dt>Original table</dt>
        <dd>{r.source.locator}</dd>
      </dl>
      <p>{r.notes}</p>
      <a
        href={r.source.url + (r.source.page ? '#page=' + r.source.page : '')}
        target="_blank"
        rel="noopener noreferrer"
      >
        Original evidence <ExternalLink size={13} />
      </a>
      {onHistory && <button onClick={onHistory}>Open programme history</button>}
    </article>
  );
}

function NationalProgramme({ record }: { record: FundingRecord }) {
  const [open, setOpen] = useState(false),
    [history, setHistory] = useState<FundingRecord[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    setLoading(true);
    setError('');
    void fetch(
      '/api/v1/funding/programmes/' +
        encodeURIComponent(record.programmeId) +
        '?' +
        new URLSearchParams({ scope: record.jurisdiction }),
      { signal: c.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setHistory(data.history);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, record.programmeId, record.jurisdiction]);
  return (
    <section>
      <FundingEvidence record={record} onHistory={() => setOpen((v) => !v)} />
      {open && (
        <div className="funding-gap">
          <h3>Programme history</h3>
          <p>Fiscal years, original/revised alternatives and funding stages stay separate.</p>
          {loading && <p role="status">Loading reviewed history…</p>}
          {error && <p role="status">{error}</p>}
          {history.map((r) => (
            <FundingEvidence key={r.id} record={r} />
          ))}
        </div>
      )}
    </section>
  );
}
