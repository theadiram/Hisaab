/** Private presentation of source candidates. Never a publication decision. */
export type ProjectEvidenceCard = {
  id: string;
  title: string;
  stateCode: string;
  evidenceLabel: string;
  stage: string | null;
  projectReference: string | null;
  identityBasis: string | null;
  financialYear: string | null;
  projectCostRupees: string | null;
  contractAmountRupees: string | null;
  contractorName: string | null;
  awardDate: string | null;
  awardFieldAsPrinted: string | null;
  bidClosingDate: string | null;
  reportingCutoff: string | null;
  retrievedAt: string | null;
  sourceRecordsWithSameReference: number;
  source: { url: string | null; locator: string | null; sha256: string | null };
  sourceFactsComparison: {
    priority: 'contract_facts_first' | 'resolve_source_gaps';
    originalTableMatched: true;
  } | null;
  paymentEvidence: 'not_reviewed';
  locationEvidence: 'not_reviewed';
  completionEvidence: 'not_reviewed';
  developmentClassification: 'awaiting_review';
  publicationApproved: false;
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const amount = (value: unknown): string | null =>
  typeof value === 'string' && /^-?\d+\.\d{2}$/.test(value) ? value : null;
function sourceUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

export function projectEvidenceCard(input: Record<string, unknown>): ProjectEvidenceCard {
  const source =
    input.source && typeof input.source === 'object'
      ? (input.source as Record<string, unknown>)
      : {};
  const contractor = text(input.contractorName);
  const contractorName =
    contractor &&
    !/^(?:to be|not awarded|not appointed|not applicable|n\/?a|nil|unknown|--?)(?:\s|$)/i.test(
      contractor,
    )
      ? contractor
      : null;
  return {
    id: String(input.id),
    title: text(input.title) ?? 'Untitled source record',
    stateCode: text(input.stateCode) ?? '',
    evidenceLabel:
      input.stage === 'tender_notice'
        ? 'Tender notice'
        : input.stage === 'award_reported'
          ? 'Reported award'
          : 'Project status record',
    stage: text(input.stage),
    projectReference: text(input.sourceProjectId),
    identityBasis: text(input.projectIdBasis),
    financialYear: text(input.financialYear),
    projectCostRupees: amount(input.projectCostRupees),
    contractAmountRupees: amount(input.contractAmountRupees),
    contractorName,
    awardDate: text(input.awardDate),
    awardFieldAsPrinted: text(input.awardDateSource),
    bidClosingDate: text(input.sourceClosingDate),
    reportingCutoff: text(input.periodEnd),
    retrievedAt: text(source.retrievedAt),
    sourceRecordsWithSameReference: 1,
    source: {
      url: sourceUrl(source.url),
      locator: text(source.locator),
      sha256:
        typeof source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(source.sha256)
          ? source.sha256
          : null,
    },
    sourceFactsComparison: null,
    paymentEvidence: 'not_reviewed',
    locationEvidence: 'not_reviewed',
    completionEvidence: 'not_reviewed',
    developmentClassification: 'awaiting_review',
    publicationApproved: false,
  };
}

/** Flag repeated references for review; never merge their facts or amounts. */
export function projectEvidenceCards(inputs: Record<string, unknown>[]) {
  const cards = inputs.map(projectEvidenceCard);
  const key = (card: ProjectEvidenceCard) =>
    card.projectReference && card.identityBasis?.startsWith('official_') && card.source.url
      ? JSON.stringify([card.stateCode, card.identityBasis, card.source.url, card.projectReference])
      : null;
  const counts = new Map<string, number>();
  for (const card of cards) {
    const reference = key(card);
    if (reference) counts.set(reference, (counts.get(reference) ?? 0) + 1);
  }
  return cards.map((card) => ({
    ...card,
    sourceRecordsWithSameReference: counts.get(key(card) ?? '') ?? 1,
  }));
}

/** Attach a source comparison only to the same unchanged edition and facts. */
export function compareProjectCardFacts(
  cards: ProjectEvidenceCard[],
  input: unknown,
): ProjectEvidenceCard[] {
  if (!input || typeof input !== 'object') return cards;
  const packet = input as Record<string, unknown>;
  if (
    packet.originalChecksumMatched !== true ||
    packet.freshTableMatchesPreservedExtraction !== true ||
    !Array.isArray(packet.records)
  )
    return cards;
  const records = new Map<string, Record<string, unknown>>();
  for (const row of packet.records) {
    if (!row || typeof row !== 'object') continue;
    if (typeof row.candidateId === 'string') records.set(row.candidateId, row);
  }
  return cards.map((card): ProjectEvidenceCard => {
    const row = records.get(card.id);
    if (
      !row ||
      !row.source ||
      typeof row.source !== 'object' ||
      !row.checkedFacts ||
      typeof row.checkedFacts !== 'object' ||
      !row.fieldChecks ||
      typeof row.fieldChecks !== 'object'
    )
      return card;
    const source = row.source as Record<string, unknown>,
      facts = row.checkedFacts as Record<string, unknown>,
      checks = row.fieldChecks as Record<string, unknown>;
    if (
      !card.source.sha256 ||
      card.source.sha256 !== packet.sourceOriginalSha256 ||
      source.sha256 !== card.source.sha256 ||
      source.url !== card.source.url ||
      row.officialProjectId !== card.projectReference ||
      row.stateCode !== card.stateCode
    )
      return card;
    if (
      [
        'title',
        'stage',
        'projectCostRupees',
        'contractAmountRupees',
        'awardDate',
        'contractorName',
      ].some((key) => facts[key] !== card[key as keyof ProjectEvidenceCard])
    )
      return card;
    if (
      [
        'originalTableMatched',
        'explicitCroreHeadings',
        'costConversionMatched',
        'awardDateMatched',
      ].some((key) => checks[key] !== true)
    )
      return card;
    const priority = row.reviewPriority;
    if (priority !== 'contract_facts_first' && priority !== 'resolve_source_gaps') return card;
    return { ...card, sourceFactsComparison: { priority, originalTableMatched: true as const } };
  });
}
