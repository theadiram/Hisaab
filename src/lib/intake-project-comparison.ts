/** Compare an intake draft with preserved pending work; never review or approve evidence. */
import { workSchema } from './validation';
import { pendingCandidateSchema } from './pending-candidate';

export function compareIntakeProject(proposedInput: unknown, currentInput: unknown) {
  const proposed = workSchema.parse(proposedInput),
    current = pendingCandidateSchema.parse(currentInput);
  const holds: string[] = [];
  if (proposed.id !== current.id)
    holds.push('The preserved candidate identity does not match this draft.');
  if (
    current.stages.some((s) => s.state === 'found' || s.reviewStatus === 'verified') ||
    current.money.some((e) => e.approved || e.reviewStatus === 'verified')
  )
    holds.push(
      'The preserved candidate already contains reviewed or found evidence. Resolve that evidence in the main owner console before replacing this draft.',
    );
  if (
    proposed.stages.some((s) => s.state === 'found' || s.reviewStatus === 'verified') ||
    proposed.money.some((e) => e.approved || e.reviewStatus === 'verified')
  )
    holds.push('The intake replacement must remain pending and unapproved.');
  const fields = [
    'title',
    'purpose',
    'state',
    'district',
    'areaId',
    'financialYear',
    'officialIds',
    'location',
    'locationPrecision',
    'physicalVerification',
    'authority',
    'authorityReceipt',
    'summary',
    'assetId',
    'roles',
    'media',
    'demo',
  ] as const;
  const differences: { field: string; current: unknown; proposed: unknown }[] = fields
    .filter((field) => JSON.stringify(current[field]) !== JSON.stringify(proposed[field]))
    .map((field) => ({ field, current: current[field], proposed: proposed[field] }));
  const stages = (work: typeof proposed) =>
    work.stages.map((s) => ({ ...s, reviewStatus: s.reviewStatus ?? 'pending' }));
  const currentStages = stages(current),
    proposedStages = stages(proposed);
  if (JSON.stringify(currentStages) !== JSON.stringify(proposedStages))
    differences.push({ field: 'stages', current: currentStages, proposed: proposedStages });
  if (JSON.stringify(current.money) !== JSON.stringify(proposed.money))
    differences.push({ field: 'money', current: current.money, proposed: proposed.money });
  return {
    id: proposed.id,
    canReconcile: holds.length === 0,
    holds,
    differences,
    currentStages,
    proposedStages,
    replacesCurrentRevision: true,
    publicationApproved: false as const,
  };
}
