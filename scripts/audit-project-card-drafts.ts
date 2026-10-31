import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { projectEvidenceCards } from '../src/lib/project-evidence-card';

const root = fileURLToPath(new URL('../', import.meta.url));
const summary = JSON.parse(
  await readFile(path.join(root, 'data/state-development-acquisition.json'), 'utf8'),
);
const states = [];
for (const state of summary.states) {
  const input = JSON.parse(
    await readFile(
      path.join(root, 'data/acquisition/state-development', state.code, 'candidates.json'),
      'utf8',
    ),
  );
  const cards = projectEvidenceCards(input.projectCandidates);
  states.push({
    code: state.code,
    name: state.name,
    sourceRecordCardDrafts: cards.length,
    referenceGroups: new Set(
      cards.map((c) => JSON.stringify([c.identityBasis, c.source.url, c.projectReference])),
    ).size,
    recordsWithRepeatedReferences: cards.filter((c) => c.sourceRecordsWithSameReference > 1).length,
    reportedContractAmountPresent: cards.filter((c) => c.contractAmountRupees !== null).length,
    reportedProjectCostPresent: cards.filter((c) => c.projectCostRupees !== null).length,
    publicationApproved: false,
  });
}
const report = {
  checkedAt: new Date().toISOString(),
  sourceRecordCardDrafts: states.reduce((s, r) => s + r.sourceRecordCardDrafts, 0),
  referenceGroups: states.reduce((s, r) => s + r.referenceGroups, 0),
  statesWithSourceRecordCards: states.filter((r) => r.sourceRecordCardDrafts > 0).length,
  states,
  limitations: [
    'Private source-record previews only; zero new public approvals.',
    'Source references may repeat or be reused. Reference groups are not a count of verified unique projects.',
    'No project site, payment, recipient, fiscal year or completion is inferred from cost, status, name or proximity.',
    'Separate Odisha PPMS and other pilots are outside this state collection.',
  ],
};
await writeFile(
  path.join(root, 'data/acquisition/state-development/card-draft-summary.json'),
  JSON.stringify(report, null, 2) + '\n',
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    sourceRecordCardDrafts: report.sourceRecordCardDrafts,
    referenceGroups: report.referenceGroups,
    statesWithSourceRecordCards: report.statesWithSourceRecordCards,
  }),
);
