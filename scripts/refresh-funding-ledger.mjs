import { readFile, writeFile } from 'node:fs/promises';
const facts = JSON.parse(await readFile('data/acquisition/funding-records.json', 'utf8')).records;
const metadata = JSON.parse(await readFile('data/funding-acquisition.json', 'utf8'));
const checkpoint = JSON.parse(
  await readFile('data/acquisition/funding-publication-checkpoint.json', 'utf8').catch(
    () => '{"publicationIds":[]}',
  ),
);
const published = new Set(checkpoint.publicationIds);
const ledger = JSON.parse(await readFile('data/funding-source-ledger.json', 'utf8'));
if (!ledger.rows.some((r) => r.programmeOrChannel === 'disaster-reconstruction'))
  for (const edition of metadata.editions)
    ledger.rows.push({
      programmeOrChannel: 'disaster-reconstruction',
      label: 'Identifiable disaster recovery and reconstruction programmes',
      financialYear: edition.financialYear,
      sourceRoute: 'https://ndmindia.mha.gov.in/ndmi/responsefund',
      stages: { allocated: {}, released: {}, reported_spent: {} },
      status: 'awaiting_source_assessment',
      gap: 'Response/recovery fund totals do not establish a separately identified reconstruction purpose.',
      nextAction:
        'Collect named reconstruction and recovery programme orders, Union-share splits and reporting periods.',
    });
for (const row of ledger.rows) {
  const rows = facts.filter(
    (r) => r.financialYear === row.financialYear && r.programmeId === row.programmeOrChannel,
  );
  for (const measure of ['allocated', 'released', 'reported_spent']) {
    const chosen = rows.filter((r) => r.measure === measure);
    row.stages[measure] = {
      candidateRecords: chosen.length,
      unionShareRecords: chosen.filter((r) => r.share === 'union').length,
      conflictingRecords: chosen.filter((r) => r.conflict).length,
      missingAmounts: chosen.filter((r) => r.amountRupees === null).length,
      reviewedRecords: chosen.filter((r) => published.has(r.id)).length,
      status: chosen.some((r) => published.has(r.id))
        ? 'reviewed_subset_with_gaps'
        : chosen.length
          ? 'private_review_pending'
          : 'awaiting_source_assessment',
    };
  }
  if (rows.length)
    row.status = rows.some((r) => published.has(r.id))
      ? 'reviewed_subset_with_gaps'
      : 'private_records_with_gaps';
  if (rows.some((r) => r.id.startsWith('mha-ls-348-20251202:')))
    row.gap =
      'Mitigation-release annexure captions and displayed fiscal years conflict. Supplemental facts remain withheld; rights, editions and unknown stages still require review.';
  if (row.programmeOrChannel === 'union-programme-lines') {
    row.gap =
      'Source fiscal columns are interpreted privately, but programme identities, development/maintenance classification and hierarchy reconciliation remain required.';
    row.nextAction =
      'Classify original rows, document programme/head identities, draft private facts from verified columns and review separately.';
  }
}
ledger.updatedAt = new Date().toISOString();
await writeFile('data/funding-source-ledger.json', JSON.stringify(ledger, null, 2) + '\n');
const progress = JSON.parse(await readFile('data/evidence-progress.json', 'utf8'));
for (const task of progress.tasks) {
  if (task.id === 'funding-budget-inventory')
    task.supportingRecord = `Eleven original expenditure PDFs; 1,109 demand identities; 69,039 private inventoried rows; ${metadata.columnInterpretations.privateRows.toLocaleString('en-IN')} fiscal-column interpretations, with four component discrepancies quarantined. Owner classification-to-private-draft workflow available.`;
  if (task.id === 'funding-disaster-pilot') {
    task.status = 'Reviewed subset published';
    task.nextAction =
      'Expand explicitly reusable Union-share allocations, programme funding and recipient utilisation. Clarify the two conflicting 2025–26 PIB columns; keep unrelated source permissions pending.';
    task.blocker = `${facts.length.toLocaleString('en-IN')} preserved facts; ${checkpoint.publishedRecords ?? 0} explicitly reviewed publications as of ${checkpoint.checkedAt ?? 'unknown'}. Remaining combined SDRF allocations, conflicting editions and 168 mitigation caption/year conflicts remain outside Union totals. Recipient utilisation and 2026–27 releases need further sources.`;
    task.supportingRecord =
      '86 PIB-derived funding facts published after owner MFA review: 28-state SDRF/NDRF releases for FY 2023–24/2024–25 and Maharashtra FY 2021–22 through 2026–27 allocations. 56 additional private explicit Union-share allocations across 28 jurisdictions; historical SDRF/NDRF release annexures; 168 withheld SDMF/NDMF release candidates; originals and government acceptance memorandum preserved.';
  }
}
metadata.disasterRecords = facts.length;
metadata.updatedAt = new Date().toISOString();
metadata.publication = 'reviewed_partial_subset';
metadata.publicationCheckpoint = {
  checkedAt: checkpoint.checkedAt,
  reviewedRecords: checkpoint.publishedRecords ?? 0,
  byYearAndStage: checkpoint.byYearAndStage ?? [],
};
await writeFile('data/funding-acquisition.json', JSON.stringify(metadata, null, 2) + '\n');
await writeFile('data/evidence-progress.json', JSON.stringify(progress, null, 2) + '\n');
console.log(
  JSON.stringify({
    sourceYearAssessments: ledger.rows.length,
    privateDisasterFacts: facts.length,
    fiscalColumnInterpretations: metadata.columnInterpretations.privateRows,
  }),
);
