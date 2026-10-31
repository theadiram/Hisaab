'use client';

import { useRef, useState } from 'react';
import { formatExactMoney } from '@/lib/money';
import { ProjectEvidenceCard } from './project-evidence-card';
import type { ProjectEvidenceCard as Card } from '@/lib/project-evidence-card';

type Counts = {
  namedBudgetCandidates?: number;
  budgetContextCandidates?: number;
  budgetCandidates?: number;
  expenditureCandidates?: number;
  projectCandidates?: number;
};
type FiscalCoverage = {
  financialYear: string;
  budgetCandidates: number;
  reportedExpenditureCandidates: number;
  latestExpenditureCutoff: string | null;
};
export type StateCollection = Counts & {
  code: string;
  name: string;
  order: number;
  originals: number;
  pdfs: number;
  blockedSources: number;
  status: string;
  nextAction: string;
  financialYearCoverage?: FiscalCoverage[];
};
export type StateDevelopmentCollection = Counts & {
  financialYears: string[];
  updatedAt: string;
  originals: number;
  pdfs: number;
  states: StateCollection[];
  statesWithNamedBudgetCandidates?: number;
  statesWithBudgetCandidates?: number;
  completeStates?: number;
};
type Row = {
  card?: Card;
  id: string;
  label?: string;
  kind?: string;
  url?: string;
  permissionStatus?: string;
  editionStatus?: string;
  retrievedAt?: string;
  extractedPages?: number;
  completeExtraction?: boolean;
  purposeLabel?: string;
  financialYear?: string | null;
  estimate?: string;
  measure?: string;
  periodStart?: string;
  periodEnd?: string | null;
  amountRupees?: string;
  revenueRupees?: string;
  capitalRupees?: string;
  components?: { label: string; amountRupees: string }[];
  printedArithmeticDifferenceCrore?: string;
  budgetTableScope?: string;
  classification?: string;
  sourceAccount?: string;
  sourceEdition?: string;
  editionConflict?: string | null;
  extractionBasis?: string;
  ocrConfidence?: number;
  reviewStatus?: string;
  title?: string;
  sourceProjectId?: string | null;
  contractorName?: string | null;
  stage?: string;
  awardDateSource?: string | null;
  projectCostRupees?: string | null;
  contractAmountRupees?: string | null;
  notes?: string;
  source?: { url: string; locator: string; sha256: string };
  decision?: string;
  suggestedPurpose?: string;
  basis?: string;
  amountMissing?: boolean;
  overlapGroups?: { key: string; records: number; status: string }[];
  checkedAt?: string;
  identityCheck?: string;
  scopeWarnings?: string[];
  remaining?: string[];
  tableControls?: {
    label: string;
    rows: number;
    status: string;
    differenceRupees: string | null;
    printedControlRupees: string;
    calculatedRupees: string | null;
  }[];
};
type Result = {
  state: StateCollection;
  section: string;
  page: number;
  pageSize: number;
  total: number;
  rows: Row[];
};
const money = (value: string | null | undefined) =>
  value == null ? 'Unavailable' : formatExactMoney(value);

export function StateDevelopmentReview({
  data,
  territories = false,
}: {
  data: StateDevelopmentCollection;
  territories?: boolean;
}) {
  const [state, setState] = useState(data.states[0]?.code ?? '28');
  const [section, setSection] = useState('cards');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const sequence = useRef(0);

  async function load(code = state, view = section, page = 1) {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch(
        '/api/v1/admin/state-development?' +
          new URLSearchParams({
            state: code,
            section: view,
            page: String(page),
            ...(territories ? { register: 'territories' } : {}),
          }),
        { cache: 'no-store' },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      if (current === sequence.current) setResult(body);
    } catch (e) {
      if (current === sequence.current)
        setError(e instanceof Error ? e.message : 'Evidence unavailable');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }
  function reset() {
    setResult(null);
    setError('');
    sequence.current++;
    setLoading(false);
  }

  return (
    <section
      className="state-development-review"
      aria-label={
        territories
          ? 'Two-year union territory development collection'
          : 'Two-year state development collection'
      }
    >
      <h4>
        {territories
          ? 'Union-territory development collection'
          : 'State-by-state development collection'}
      </h4>
      <p>
        FY 2025–26 and FY 2026–27 to source cutoff · {data.originals.toLocaleString('en-IN')}{' '}
        preserved source responses, including {data.pdfs} PDFs. First source pass; statewide
        coverage remains partial.
      </p>
      {data.budgetCandidates !== undefined && (
        <p>
          {data.budgetCandidates} budget candidates · {data.expenditureCandidates}{' '}
          reported-expenditure candidates · {data.projectCandidates} project/tender candidates.
          These are unpublished review records, with overlapping scopes.
        </p>
      )}
      {data.statesWithBudgetCandidates !== undefined && (
        <p>
          {data.statesWithBudgetCandidates} of {data.states.length}{' '}
          {territories ? 'union territories' : 'states'} have extracted budget candidates.{' '}
          {data.completeStates ?? 0} have complete reconciled coverage. Saved documents alone do not
          establish completion.
        </p>
      )}
      {data.statesWithNamedBudgetCandidates !== undefined && (
        <p>
          {data.statesWithNamedBudgetCandidates} {territories ? 'union territories' : 'states'} have
          named budget table entries beyond broad accounting overviews. Programme, grant and
          department records can overlap; they are not a count of unique projects.
        </p>
      )}
      <p>
        <strong>
          {data.projectCandidates ?? 0} project/tender source records across{' '}
          {data.states.filter((s) => (s.projectCandidates ?? 0) > 0).length}{' '}
          {territories ? 'union territories' : 'states'}, available as card drafts.
        </strong>{' '}
        Full payment evidence is still pending. Each draft shows one collected record; repeated
        references may describe the same project.
      </p>
      <details>
        <summary>
          {territories ? 'All 8 union territories' : 'All 28 states in your collection order'}
        </summary>
        {data.states.map((s) => (
          <p key={s.code}>
            <strong>
              {s.order}. {s.name}
            </strong>{' '}
            · {s.originals} source responses · {s.blockedSources} source gaps
            <br />
            {s.budgetCandidates !== undefined && (
              <>
                {s.budgetCandidates} budget · {s.expenditureCandidates} expenditure ·{' '}
                {s.projectCandidates} project/tender candidates
                <br />
              </>
            )}
            {s.namedBudgetCandidates !== undefined && (
              <>
                {s.namedBudgetCandidates} named budget entries · {s.budgetContextCandidates} broad
                budget-context entries
                <br />
              </>
            )}
            {s.financialYearCoverage?.map((y) => (
              <span key={y.financialYear}>
                {y.financialYear}: {y.budgetCandidates} budget records ·{' '}
                {y.reportedExpenditureCandidates} expenditure records
                {y.latestExpenditureCutoff && (
                  <> · expenditure through {y.latestExpenditureCutoff}</>
                )}
                <br />
              </span>
            ))}
            {s.nextAction}
          </p>
        ))}
      </details>
      <p>
        Owner review shows unpublished source records. An estimate, project cost or winning bidder
        does not establish a payment.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load();
        }}
      >
        <label>
          {territories ? 'Union territory' : 'State'}
          <select
            aria-label={territories ? 'Union territory' : 'State'}
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              reset();
            }}
          >
            {data.states.map((s) => (
              <option value={s.code} key={s.code}>
                {s.order}. {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Evidence
          <select
            aria-label="Evidence"
            value={section}
            onChange={(e) => {
              setSection(e.target.value);
              reset();
            }}
          >
            <option value="cards">Project card drafts</option>
            <option value="sources">Original sources</option>
            <option value="budget">Sector and programme budgets</option>
            <option value="expenditure">Reported expenditure</option>
            <option value="projects">Projects and contractors</option>
            <option value="classification">Development classification suggestions</option>
            <option value="reconciliation">Extraction and reconciliation checks</option>
          </select>
        </label>
        <button className="secondary" disabled={loading}>
          {loading ? 'Loading evidence…' : 'Inspect collected evidence'}
        </button>
      </form>
      {error && (
        <p role="alert">
          {error} <a href="/admin">Owner sign-in</a>
        </p>
      )}
      {result && (
        <>
          <p>
            {result.state.name} · {result.total} records · Page {result.page}
          </p>
          {result.rows.map((r) =>
            r.card ? (
              <ProjectEvidenceCard key={r.id} card={r.card} />
            ) : (
              <details key={r.id}>
                <summary>{r.label ?? r.purposeLabel ?? r.title ?? r.id}</summary>
                {r.decision && (
                  <p>
                    {r.financialYear} · Suggested purpose: {r.suggestedPurpose}
                    <br />
                    Scope: {r.decision.replaceAll('_', ' ')}
                    <br />
                    {r.basis}
                    <br />
                    Amount:{' '}
                    {r.amountMissing ? 'Unavailable' : 'Preserved in the budget evidence record'}
                    <br />
                    Suggestion only. Source rights, overlaps and owner decisions remain pending.
                  </p>
                )}
                {r.overlapGroups && (
                  <p>
                    {r.overlapGroups.length} overlapping source groups require review. Repeated
                    amounts are not added together.
                  </p>
                )}
                {r.kind && (
                  <p>
                    {r.kind.replaceAll('_', ' ')} · {r.permissionStatus}
                  </p>
                )}
                {r.editionStatus && <p>{r.editionStatus}</p>}
                {r.retrievedAt && (
                  <p>
                    Retrieved: {r.retrievedAt}
                    <br />
                    Text extraction attempted on {r.extractedPages} pages. Tables and source scope
                    still require review.
                    {r.completeExtraction === false && (
                      <>
                        <br />
                        Extraction incomplete; visual/OCR review needed.
                      </>
                    )}
                  </p>
                )}
                {r.reviewStatus && <p>Review: {r.reviewStatus.replaceAll('_', ' ')}</p>}
                {r.identityCheck && (
                  <p>
                    Candidate identities: {r.identityCheck}. Arithmetic checks do not approve
                    publication or establish complete coverage.
                  </p>
                )}
                {r.tableControls?.map((c, i) => (
                  <p key={i}>
                    <strong>{c.label}</strong>
                    <br />
                    {c.rows} source rows · {c.status.replaceAll('_', ' ')}
                    <br />
                    Printed control: {money(c.printedControlRupees)}
                    <br />
                    Extracted rows: {money(c.calculatedRupees)}
                    <br />
                    Difference: {money(c.differenceRupees)}
                  </p>
                ))}
                {r.scopeWarnings?.map((w) => (
                  <p key={w}>{w}</p>
                ))}
                {r.remaining && <p>Still required: {r.remaining.join('; ')}.</p>}
                {r.classification && (
                  <p>Draft classification: {r.classification.replaceAll('_', ' ')}</p>
                )}
                {r.sourceAccount && <p>Account: {r.sourceAccount}</p>}
                {r.sourceEdition && <p>Source edition: {r.sourceEdition}</p>}
                {r.editionConflict && <p>Conflicting source editions: {r.editionConflict}</p>}
                {r.extractionBasis && (
                  <p>
                    Extraction: {r.extractionBasis.replaceAll('_', ' ')}. Text recognition still
                    requires evidence review.
                  </p>
                )}
                {r.amountRupees && r.measure === 'reported_spent' && (
                  <p>
                    {r.financialYear} · Source-reported expenditure
                    <br />
                    <strong>{money(r.amountRupees)}</strong>
                    <br />
                    {r.periodStart} to {r.periodEnd}
                    <br />
                    Government accounting category; development-only classification pending.
                  </p>
                )}
                {r.amountRupees && r.measure !== 'reported_spent' && (
                  <>
                    <p>
                      {r.financialYear} · {r.estimate} budget estimate
                      <br />
                      <strong>{money(r.amountRupees)}</strong> allocation
                      {r.budgetTableScope && (
                        <>
                          <br />
                          {r.budgetTableScope.replaceAll('_', ' ')}
                        </>
                      )}
                    </p>
                    {(r.revenueRupees !== undefined || r.capitalRupees !== undefined) && (
                      <p>
                        Revenue: {money(r.revenueRupees)} · Capital: {money(r.capitalRupees)}
                        <br />
                        Components of the total; do not add them again.
                      </p>
                    )}
                    {r.components && (
                      <p>
                        {r.components.map((c) => (
                          <span key={c.label}>
                            {c.label}: {money(c.amountRupees)}
                            <br />
                          </span>
                        ))}
                        Components of the total; do not add them again.
                      </p>
                    )}
                    {r.printedArithmeticDifferenceCrore !== undefined &&
                      Number(r.printedArithmeticDifferenceCrore) !== 0 && (
                        <p>
                          Printed arithmetic difference: {r.printedArithmeticDifferenceCrore} crore.
                          Retained for review.
                        </p>
                      )}
                  </>
                )}
                {r.title && (
                  <p>
                    Contractor: {r.contractorName ?? 'Unavailable'}
                    <br />
                    Project identifier:{' '}
                    {r.sourceProjectId ?? 'Source row only; official identifier needed'}
                    <br />
                    Source status: {r.stage}
                    <br />
                    Award date: {r.awardDateSource ?? 'Unavailable'}
                    <br />
                    Total project cost: {money(r.projectCostRupees)}
                    <br />
                    Awarded contract cost: {money(r.contractAmountRupees)}
                    <br />
                    Source reporting cutoff: {r.periodEnd ?? 'Unavailable'}
                    <br />
                    Individual payment: unavailable
                  </p>
                )}
                {r.notes && <p>{r.notes}</p>}
                {r.source && <p>{r.source.locator}</p>}
                {(r.url ?? r.source?.url) && (
                  <a href={r.url ?? r.source?.url} target="_blank" rel="noreferrer">
                    Open original source
                  </a>
                )}
              </details>
            ),
          )}
          {result.total === 0 && (
            <p>
              {result.section === 'cards'
                ? 'No project card candidates in this state collection yet. Separate Hisaab pilots may hold additional evidence. Choose Sector and programme budgets to inspect the collected funding evidence.'
                : 'No normalized records in this section yet. Preserved originals remain available under Original sources; absence here is not zero spending.'}
            </p>
          )}
          <button
            disabled={loading || result.page === 1}
            onClick={() => void load(state, section, result.page - 1)}
          >
            Previous
          </button>{' '}
          <button
            disabled={loading || result.page * 25 >= result.total}
            onClick={() => void load(state, section, result.page + 1)}
          >
            Next
          </button>
        </>
      )}
    </section>
  );
}
