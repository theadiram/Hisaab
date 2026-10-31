import { validateIntake } from './intake-contract';
import { workSchema } from './validation';
import type { Work } from './model';

export function checkedRoadPreview(input: unknown) {
  const batch = validateIntake(input).package;
  if (
    batch.payments.length ||
    batch.allocations.length ||
    batch.completion.length ||
    batch.parties.length ||
    batch.funding.length
  )
    throw new Error('Only narrow road facts are permitted in this review.');
  for (const work of batch.projects) {
    if (
      work.purpose !== 'Roads' ||
      work.demo ||
      work.money.length ||
      !work.location ||
      work.locationPrecision !== 'source_point' ||
      !work.physicalVerification?.includes('not independently verified')
    )
      throw new Error('Road preview requires an explicitly unverified source point and no money.');
    if (
      work.stages.some(
        (s) => s.amount !== null || s.state === 'found' || s.reviewStatus === 'verified',
      )
    )
      throw new Error('Input must remain unapproved and contain no amounts.');
    for (const id of ['sanction', 'award']) {
      const stage = work.stages.find((s) => s.id === id);
      if (!stage?.date || !stage.receipts.length)
        throw new Error('Both reported stage dates need source receipts.');
    }
    if (
      work.stages.some(
        (s) => !['sanction', 'award'].includes(s.id) && (s.receipts.length || s.date),
      )
    )
      throw new Error('Additional stages require separate review.');
  }
  return batch;
}

export function reviewedRoadFacts(input: Work, permissionByIdentity: Map<string, string>) {
  const work = workSchema.parse(input);
  if (
    work.money.length ||
    work.locationPrecision !== 'source_point' ||
    !work.physicalVerification?.includes('not independently verified')
  )
    throw new Error('Unsafe road-preview scope.');
  return workSchema.parse({
    ...work,
    stages: work.stages.map((stage) => {
      if (!['sanction', 'award'].includes(stage.id))
        return {
          ...stage,
          state: 'inaccessible',
          reviewStatus: 'pending',
          amount: null,
          date: null,
          receipts: [],
        };
      if (!stage.date || !stage.receipts.length || stage.amount !== null)
        throw new Error('Only documented dates with unknown amounts may be reviewed.');
      return {
        ...stage,
        state: 'found',
        reviewStatus: 'verified',
        receipts: stage.receipts.map((receipt) => {
          const basis = permissionByIdentity.get(`${receipt.documentHash}|${receipt.url}`);
          if (!basis)
            throw new Error('Every exact cited original needs a recorded rights decision.');
          return { ...receipt, permission: basis };
        }),
      };
    }),
  });
}
