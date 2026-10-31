/** Private review aid only. This never approves or publishes a work. */
import { workSchema } from './validation';
import { assertPublicationEvidence } from './publication-evidence';

type DocumentReview = {
  documentHash: string;
  url: string;
  originalChecksumVerified: boolean;
  sourceApproved: boolean;
  reuseReviewed: boolean;
};
type DocumentaryAssociation = {
  workId: string;
  officialProjectId: string;
  documentHash: string;
  url: string;
  locator: string;
  basis: 'official_id' | 'documented_crosswalk';
  /** Reviewed documentary association; this is not independent field verification. */
  reviewed: boolean;
};
export type PublicationReviewContext = {
  documents: DocumentReview[];
  approvedDistrictId: string | null;
  identity: DocumentaryAssociation | null;
  site: (DocumentaryAssociation & { coordinates: [number, number] }) | null;
};

export function assessPublicationReviewReadiness(
  input: unknown,
  context: PublicationReviewContext,
) {
  const blockers: string[] = [];
  const parsed = workSchema.safeParse(input);
  if (!parsed.success)
    return {
      readyForOwnerDecision: false,
      publicationApproved: false as const,
      independentPhysicalVerificationAssessed: false as const,
      meaningfulReviewedStages: [] as string[],
      blockers: ['Work payload fails the existing publication schema.'],
    };
  const work = parsed.data;
  try {
    assertPublicationEvidence(work);
  } catch {
    blockers.push('Existing publication evidence checks fail.');
  }
  const reviewedDocument = (hash: string, url: string) =>
    context.documents.some(
      (d) =>
        d.documentHash === hash &&
        d.url === url &&
        d.originalChecksumVerified &&
        d.sourceApproved &&
        d.reuseReviewed,
    );
  const meaningful = work.stages.filter(
    (s) => s.state === 'found' && s.reviewStatus === 'verified' && s.receipts.length > 0,
  );
  if (!meaningful.length)
    blockers.push('At least one meaningful stage needs reviewed source evidence.');
  const allReceipts = [
    ...work.stages.flatMap((s) => s.receipts),
    ...(work.authorityReceipt ? [work.authorityReceipt] : []),
    ...(work.roles ?? []).map((r) => r.receipt),
    ...(work.media ?? []).map((m) => m.receipt),
  ];
  if (allReceipts.some((r) => !reviewedDocument(r.documentHash, r.url)))
    blockers.push('Every cited document needs checksum, source and reuse review.');
  if (!context.approvedDistrictId || context.approvedDistrictId !== work.areaId)
    blockers.push('An approved district identity must match this work.');
  const associationValid = (a: DocumentaryAssociation | null) =>
    Boolean(
      a &&
      a.reviewed &&
      ['official_id', 'documented_crosswalk'].includes(a.basis) &&
      a.workId === work.id &&
      work.officialIds.includes(a.officialProjectId) &&
      a.locator.trim() &&
      reviewedDocument(a.documentHash, a.url),
    );
  if (!associationValid(context.identity))
    blockers.push('Project identity needs a reviewed documentary association.');
  if (!work.location || !['source_point', 'address'].includes(work.locationPrecision))
    blockers.push('A map dot needs documentary project-site coordinates.');
  if (
    !associationValid(context.site) ||
    !work.location ||
    !context.site ||
    context.site.coordinates[0] !== work.location[0] ||
    context.site.coordinates[1] !== work.location[1]
  )
    blockers.push('Site evidence must explicitly support this project and these coordinates.');
  return {
    readyForOwnerDecision: blockers.length === 0,
    publicationApproved: false as const,
    independentPhysicalVerificationAssessed: false as const,
    meaningfulReviewedStages: meaningful.map((s) => s.id),
    blockers,
  };
}
