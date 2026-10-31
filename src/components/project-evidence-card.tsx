import type { ProjectEvidenceCard as Card } from '@/lib/project-evidence-card';
import { formatExactMoney } from '@/lib/money';

export function ProjectEvidenceCard({ card }: { card: Card }) {
  const money = (value: string | null) =>
    value === null ? 'Not available in this record' : formatExactMoney(value);
  return (
    <article className="project-evidence-card" aria-label={card.title}>
      <div className="project-evidence-card-status">
        <span>{card.evidenceLabel}</span>
        <span>Private draft</span>
      </div>
      <h5>{card.title}</h5>
      <p className="project-evidence-card-reference">
        {card.projectReference ?? 'Official project reference unavailable'}
      </p>
      {card.sourceFactsComparison && (
        <p>
          <strong>Original-source comparison passed.</strong> Title, status, costs and award date
          match the preserved source table.
          {card.sourceFactsComparison.priority === 'contract_facts_first'
            ? ' Prioritised for contract-fact review.'
            : ' Additional contract or lifecycle gaps need review.'}{' '}
          Payment, location and publication review remain pending.
        </p>
      )}
      {card.sourceRecordsWithSameReference > 1 && (
        <p>
          {card.sourceRecordsWithSameReference} collected records share this source reference. They
          may describe the same work or amendments; do not count them as separate projects or add
          their amounts.
        </p>
      )}
      <dl className="project-evidence-card-amounts">
        <div>
          <dt>Reported total project cost</dt>
          <dd>{money(card.projectCostRupees)}</dd>
        </div>
        <div>
          <dt>Reported contract amount</dt>
          <dd>{money(card.contractAmountRupees)}</dd>
        </div>
      </dl>
      <p>These amounts are separate source figures. Neither establishes money paid.</p>
      <dl>
        <div>
          <dt>Named contractor / successful bidder</dt>
          <dd>{card.contractorName ?? 'Not established in this record'}</dd>
        </div>
        <div>
          <dt>Source status</dt>
          <dd>{card.stage?.replaceAll('_', ' ') ?? 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Financial year</dt>
          <dd>
            {card.financialYear ?? 'Not established; collection year is not the funding year'}
          </dd>
        </div>
        <div>
          <dt>Award date</dt>
          <dd>{card.awardDate ?? 'Not established'}</dd>
        </div>
        {card.awardFieldAsPrinted && (
          <div>
            <dt>Award field as printed</dt>
            <dd>{card.awardFieldAsPrinted}</dd>
          </div>
        )}
        {card.bidClosingDate && (
          <div>
            <dt>Bid closing date</dt>
            <dd>{card.bidClosingDate}</dd>
          </div>
        )}
        <div>
          <dt>Reporting cutoff</dt>
          <dd>{card.reportingCutoff ?? 'Not established'}</dd>
        </div>
      </dl>
      <details>
        <summary>Evidence still needed for a spending card</summary>
        <ul>
          <li>Reviewed project location; no map dot inferred.</li>
          <li>Sanction and agreement evidence.</li>
          <li>Project-allocated payment amount, payment date and recipient.</li>
          <li>Available completion certificate and publication review.</li>
        </ul>
        <p>
          Purpose classification is pending. Source records may include maintenance, administration
          or services. A contractor name does not establish who received a payment.
        </p>
      </details>
      <footer>
        {card.source.locator && <p>{card.source.locator}</p>}
        {card.retrievedAt && <small>Source retrieved {card.retrievedAt}</small>}
        {card.source.url && (
          <a href={card.source.url} target="_blank" rel="noreferrer">
            Read original source ↗
          </a>
        )}
      </footer>
    </article>
  );
}
