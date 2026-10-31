import { describe, expect, it } from 'vitest';
import {
  projectEvidenceCard,
  projectEvidenceCards,
  compareProjectCardFacts,
} from '../src/lib/project-evidence-card';

describe('private project card drafts', () => {
  it('attaches original comparisons only to unchanged facts and the exact source edition', () => {
    const input = {
      id: 'checked',
      title: 'Road',
      stateCode: '18',
      sourceProjectId: 'UPN1',
      projectIdBasis: 'official_pmp_upn',
      stage: 'Ongoing',
      contractAmountRupees: '100.00',
      projectCostRupees: '150.00',
      awardDate: '2025-05-01',
      source: { url: 'https://example.gov.in/report', sha256: 'a'.repeat(64) },
    };
    const card = projectEvidenceCard(input);
    const row = {
      candidateId: card.id,
      stateCode: card.stateCode,
      officialProjectId: card.projectReference,
      source: card.source,
      checkedFacts: {
        title: card.title,
        stage: card.stage,
        contractAmountRupees: card.contractAmountRupees,
        projectCostRupees: card.projectCostRupees,
        awardDate: card.awardDate,
        contractorName: card.contractorName,
      },
      fieldChecks: {
        originalTableMatched: true,
        explicitCroreHeadings: true,
        costConversionMatched: true,
        awardDateMatched: true,
      },
      reviewPriority: 'contract_facts_first',
    };
    const packet = {
      originalChecksumMatched: true,
      freshTableMatchesPreservedExtraction: true,
      sourceOriginalSha256: 'a'.repeat(64),
      records: [row],
    };
    expect(compareProjectCardFacts([card], packet)[0].sourceFactsComparison?.priority).toBe(
      'contract_facts_first',
    );
    expect(
      compareProjectCardFacts([{ ...card, contractAmountRupees: '101.00' }], packet)[0]
        .sourceFactsComparison,
    ).toBeNull();
    expect(
      compareProjectCardFacts([{ ...card, contractorName: 'Different contractor' }], packet)[0]
        .sourceFactsComparison,
    ).toBeNull();
    expect(
      compareProjectCardFacts([card], { ...packet, sourceOriginalSha256: 'b'.repeat(64) })[0]
        .sourceFactsComparison,
    ).toBeNull();
    expect(
      compareProjectCardFacts([card], { ...packet, originalChecksumMatched: false })[0]
        .sourceFactsComparison,
    ).toBeNull();
    expect(compareProjectCardFacts([card], packet)[0].publicationApproved).toBe(false);
  });
  it('flags repeated official source references without merging conflicting amounts or matching names', () => {
    const base = {
      stateCode: '18',
      projectIdBasis: 'official_tender_id',
      sourceProjectId: 'REF1',
      title: 'Road',
      source: { url: 'https://example.gov.in/report' },
    };
    const cards = projectEvidenceCards([
      { ...base, id: 'a', contractAmountRupees: '100.00' },
      { ...base, id: 'b', contractAmountRupees: '101.00' },
      { ...base, id: 'c', sourceProjectId: 'REF2', contractAmountRupees: '100.00' },
    ]);
    expect(cards.map((c) => c.sourceRecordsWithSameReference)).toEqual([2, 2, 1]);
    expect(cards.map((c) => c.contractAmountRupees)).toEqual(['100.00', '101.00', '100.00']);
  });
  it('keeps cost, contract and payment evidence distinct without converting progress into payments', () => {
    const card = projectEvidenceCard({
      id: 'one',
      title: 'Road',
      stateCode: '18',
      stage: 'Ongoing',
      projectCostRupees: '1000000.00',
      contractAmountRupees: '800000.00',
      financialProgressSource: '90',
      paymentAmountRupees: '720000.00',
      publicationApproved: true,
      contractorName: 'Example Infrastructure',
      source: { url: 'https://example.gov.in/report', locator: 'Page 2' },
    });
    expect(card.projectCostRupees).toBe('1000000.00');
    expect(card.contractAmountRupees).toBe('800000.00');
    expect(card.paymentEvidence).toBe('not_reviewed');
    expect(card).not.toHaveProperty('paymentAmountRupees');
    expect(card.publicationApproved).toBe(false);
    expect(card.financialYear).toBeNull();
  });
  it('preserves a printed zero and keeps absent amounts unknown', () => {
    const card = projectEvidenceCard({
      id: 'two',
      contractAmountRupees: '0.00',
      projectCostRupees: null,
    });
    expect(card.contractAmountRupees).toBe('0.00');
    expect(card.projectCostRupees).toBeNull();
  });
  it('does not treat reaward status, a tender closing date or a snapshot year as a contractor, payment date or funding year', () => {
    const card = projectEvidenceCard({
      id: 'three',
      stage: 'tender_notice',
      contractorName: 'To be Re-awarded',
      sourceClosingDate: '17-Oct-2026',
      sourceSnapshotYear: '2026-2027',
      awardDateSource: 'Terminated',
    });
    expect(card.contractorName).toBeNull();
    expect(card.awardDate).toBeNull();
    expect(card.financialYear).toBeNull();
    expect(card.evidenceLabel).toBe('Tender notice');
    expect(card.bidClosingDate).toBe('17-Oct-2026');
    expect(card.awardFieldAsPrinted).toBe('Terminated');
  });
  it('whitelists display fields and rejects unsafe source links', () => {
    const card = projectEvidenceCard({
      id: 'four',
      bankAccount: 'private',
      original: '/private/file',
      source: { url: 'javascript:alert(1)', locator: 'Row 1', original: '/private/another' },
    });
    expect(card.source.url).toBeNull();
    expect(JSON.stringify(card)).not.toContain('private');
  });
});
