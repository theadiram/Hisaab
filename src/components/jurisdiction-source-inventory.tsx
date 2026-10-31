'use client';

import { useEffect, useState } from 'react';

type JurisdictionInventory = {
  code: string;
  name: string;
  kind: 'state' | 'union_territory';
  collectionStatus: string;
  blockedSources: number;
  nextResearchStep: string;
  historicalMapRecords: number;
  distinctMpladsWorkRecords: number;
  distinctProjectTenderReferences: number;
  districtNameMatchCandidates: number;
  districtsInSavedRegistry: number;
  pmgsyWorkingWindowCandidates: number;
  mpladsSourceRows: number;
  sourceOriginals: number;
  sourcePdfs: number;
  sourceTables: number;
  numericEvidenceLines: number;
  budgetCandidates: number;
  reportedExpenditureCandidates: number;
  projectTenderCandidates: number;
  reviewedFactsInStateCollection: number;
  publishedFactsInStateCollection: number;
};
type OdishaCollections = {
  ppms: {
    billRows: number;
    projectCodes: number;
    districtLabels: number;
    observedBillDocumentLinks: number;
    assessedBillDocuments: number;
    sourceLocationProjects: number;
    photoCoordinateRecords: number;
    readableConsistentBillProjects: number;
    deepSourceReviewedProjects: number;
    verifiedProjectPayments: number;
    note: string;
  };
  panchayat: {
    planningRecords: number;
    activitiesWithReportedGeotags: number;
    proposedPaymentMatches: number;
    verifiedPaymentLinks: number;
    note: string;
  };
  institutionBankStatus: {
    sourceReportedBankAcceptedRows: number;
    allocatedToProjects: number;
    note: string;
  };
};
type ResponseData = {
  auditedAt: string;
  scope: string;
  jurisdiction: JurisdictionInventory;
  odishaAdditionalCollections: OdishaCollections | null;
};

const count = (n: number) => n.toLocaleString('en-IN');
const snapDate = (value: string) =>
  new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function JurisdictionSourceInventory({ jurisdiction }: { jurisdiction: string }) {
  const [data, setData] = useState<ResponseData | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    void fetch('/api/v1/jurisdiction-evidence?' + new URLSearchParams({ name: jurisdiction }), {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setData(result);
      })
      .catch((cause) => {
        if (cause instanceof Error && cause.name === 'AbortError') return;
        setError(cause instanceof Error ? cause.message : 'Source inventory unavailable.');
      });
    return () => controller.abort();
  }, [jurisdiction]);

  if (!data)
    return (
      <section
        className="atlas-source-inventory"
        aria-label={`Source inventory for ${jurisdiction}`}
      >
        <h3>What we have collected</h3>
        <p role="status">{error || 'Loading the dated source inventory…'}</p>
      </section>
    );

  const item = data.jurisdiction;
  return (
    <section className="atlas-source-inventory" aria-label={`Source inventory for ${jurisdiction}`}>
      <h3>What we have collected</h3>
      <p className="atlas-caption">
        Snapshot {snapDate(data.auditedAt)}. This covers the tracked state/UT development
        acquisition streams; Odisha’s separate PPMS and Panchayat collections are listed below.
        Counts are not verified spending or unique project totals, sources overlap, and cutoffs
        vary.
      </p>
      <div className="atlas-source-inventory-grid">
        <div>
          <small>Asset records with location + details</small>
          <strong>{count(item.historicalMapRecords)}</strong>
          <span>
            2022 archive · source-listed asset type and category; not a current asset count
          </span>
        </div>
        <div>
          <small>PMGSY work candidates</small>
          <strong>{count(item.pmgsyWorkingWindowCandidates)}</strong>
          <span>Saved working-window records · locations and payments need separate review</span>
        </div>
        <div>
          <small>MPLADS work IDs</small>
          <strong>{count(item.distinctMpladsWorkRecords)}</strong>
          <span>Distinct work IDs across Lok Sabha and Rajya Sabha source reports</span>
        </div>
        <div>
          <small>Distinct project / tender IDs</small>
          <strong>{count(item.distinctProjectTenderReferences)}</strong>
          <span>Deduplicated within this jurisdiction’s source collection</span>
        </div>
        <div>
          <small>Budget candidates</small>
          <strong>{count(item.budgetCandidates)}</strong>
          <span>FY 2025–26 and FY 2026–27 collection · awaiting reconciliation</span>
        </div>
        <div>
          <small>Reported-expenditure candidates</small>
          <strong>{count(item.reportedExpenditureCandidates)}</strong>
          <span>Source candidates · not project payments</span>
        </div>
      </div>
      <p className="atlas-source-inventory-scope">{data.scope}</p>
      <details className="atlas-source-inventory-more">
        <summary>Collection details and what is still unverified</summary>
        <dl>
          <dt>Preserved source responses</dt>
          <dd>
            {count(item.sourceOriginals)} originals · {count(item.sourcePdfs)} PDFs ·{' '}
            {count(item.sourceTables)} source tables
          </dd>
          <dt>MPLADS report rows</dt>
          <dd>
            {count(item.mpladsSourceRows)} rows · {count(item.distinctMpladsWorkRecords)} distinct
            work IDs
          </dd>
          <dt>Numeric evidence lines</dt>
          <dd>
            {count(item.numericEvidenceLines)} lines collected; these are not unique financial facts
          </dd>
          <dt>Reported-expenditure candidates</dt>
          <dd>
            {count(item.reportedExpenditureCandidates)} source candidates; not project payments
          </dd>
          <dt>Project / tender candidates</dt>
          <dd>
            {count(item.projectTenderCandidates)} in the state/UT development collection; separate
            Odisha schemes may have additional records
          </dd>
          <dt>District-name matches</dt>
          <dd>
            {count(item.districtNameMatchCandidates)} of {count(item.districtsInSavedRegistry)}{' '}
            saved district names have candidate matches; not verified boundaries
          </dd>
          <dt>Reviewed facts in this acquisition</dt>
          <dd>
            {count(item.reviewedFactsInStateCollection)} reviewed ·{' '}
            {count(item.publishedFactsInStateCollection)} published in this collection
          </dd>
        </dl>
        <p>
          <strong>Next research step:</strong> {item.nextResearchStep}
        </p>
        {data.odishaAdditionalCollections && (
          <OdishaEvidence data={data.odishaAdditionalCollections} />
        )}
        <p className="atlas-source-inventory-limit">
          Next: connect each source row to its exact programme, work and location; review what the
          source actually establishes; keep payment and completion unknown until their own records
          support them. A zero here means no record in this saved collection, not zero activity.
        </p>
      </details>
    </section>
  );
}

function OdishaEvidence({ data }: { data: OdishaCollections }) {
  return (
    <section
      className="odisha-source-collections"
      aria-label="Odisha additional source collections"
    >
      <h4>Odisha project and Panchayat research</h4>
      <p>
        <strong>PPMS:</strong> {count(data.ppms.billRows)} bill rows,{' '}
        {count(data.ppms.projectCodes)} project codes and {count(data.ppms.districtLabels)} district
        labels. {count(data.ppms.sourceLocationProjects)} projects have source-linked photo-location
        dossiers ({count(data.ppms.photoCoordinateRecords)} photo-coordinate records).{' '}
        {count(data.ppms.readableConsistentBillProjects)} projects have readable, consistent bill
        evidence; {count(data.ppms.deepSourceReviewedProjects)} received deeper source review.
      </p>
      <p>
        <strong>Payment status:</strong> {count(data.ppms.verifiedProjectPayments)} verified project
        payments in this review. {count(data.ppms.assessedBillDocuments)} of{' '}
        {count(data.ppms.observedBillDocumentLinks)} observed bill-document links assessed.
      </p>
      <p>
        <strong>Chandanbhati Panchayat:</strong> {count(data.panchayat.planningRecords)} planning
        records; {count(data.panchayat.activitiesWithReportedGeotags)} activities with reported
        geotags. {count(data.panchayat.verifiedPaymentLinks)} verified payment links.
      </p>
      <p>
        <strong>Rural Works bank-status report:</strong>{' '}
        {count(data.institutionBankStatus.sourceReportedBankAcceptedRows)} source-reported
        bank-accepted rows, with {count(data.institutionBankStatus.allocatedToProjects)} allocated
        to projects in this audit.
      </p>
      <small>
        {data.ppms.note} {data.panchayat.note} {data.institutionBankStatus.note}
      </small>
    </section>
  );
}
