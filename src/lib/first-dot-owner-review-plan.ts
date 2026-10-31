/** Private presentation checklist. The caller must enforce owner MFA before display. */
import { validateIntake } from './intake-contract';

export function firstDotOwnerReviewPlan(input: unknown) {
  const { package: batch } = validateIntake(input);
  const sourceByHash = new Map(batch.sources.map((source) => [source.hash, source]));
  const projects = batch.projects.map((work) => {
    const references = work.stages.flatMap((stage) =>
      stage.receipts.map((receipt) => ({
        hash: receipt.documentHash,
        url: receipt.url,
        locator: receipt.locator,
      })),
    );
    for (const receipt of [
      work.authorityReceipt,
      ...(work.roles ?? []).map((r) => r.receipt),
      ...(work.media ?? []).map((m) => m.receipt),
    ]) {
      if (receipt)
        references.push({ hash: receipt.documentHash, url: receipt.url, locator: receipt.locator });
    }
    for (const kind of ['assets', 'contracts', 'allocations', 'parties', 'completion'] as const) {
      for (const record of batch[kind])
        if (record.projectId === work.id) references.push(...record.sourceRefs);
    }
    const allocatedPaymentIds = new Set(
      batch.allocations.filter((a) => a.projectId === work.id).map((a) => a.paymentId),
    );
    for (const payment of batch.payments)
      if (allocatedPaymentIds.has(payment.id)) references.push(...payment.sourceRefs);
    const documentHashes = [...new Set(references.map((r) => r.hash))];
    const sourceDocuments = documentHashes.map((hash) => {
      const source = sourceByHash.get(hash)!; // validateIntake already checks exact source references.
      return {
        hash,
        sourceId: source.id,
        name: source.name,
        url: source.url,
        suggestedReuseBasis: source.reuseBasis,
        locators: [...new Set(references.filter((r) => r.hash === hash).map((r) => r.locator))],
        originalUploadAndChecksumRequired: true,
        documentRightsDecisionRequired: true,
      };
    });
    return {
      id: work.id,
      title: work.title,
      state: work.state,
      district: work.district,
      areaId: work.areaId,
      officialIds: work.officialIds,
      financialYear: work.financialYear,
      summary: work.summary,
      proposedCoordinate: work.location,
      locationMeaning: work.physicalVerification,
      proposedGeometry: batch.assets.find((asset) => asset.projectId === work.id)?.geometry ?? null,
      sourceDocuments,
      stageChoices: work.stages.map((stage) => ({
        id: stage.id,
        label: stage.label,
        date: stage.date,
        description: stage.description,
        currentState: stage.state,
        hasSourceEvidence: stage.receipts.length > 0,
        canBeConsideredForEvidenceReview:
          stage.receipts.length > 0 && stage.state !== 'conflicting',
        amountUnknown: stage.amount === null,
        instruction: stage.receipts.length
          ? 'Inspect the originals and decide only the supported claim.'
          : 'Keep unavailable evidence unknown; do not mark this stage found.',
      })),
      monetaryEntriesRequireSeparateDecision: work.money.length,
      districtIdentityDecisionRequired: true,
      projectIdentityDecisionRequired: true,
      documentarySiteAssociationDecisionRequired: work.location !== null,
      hasCandidateMapCoordinate: work.location !== null,
      independentPhysicalVerificationAssessed: false,
      publicationBlocked: true,
      nextAction:
        'Upload/register every source original, stage this package, prepare pending candidates, then record individual owner evidence and rights decisions.',
    };
  });
  return {
    batchId: batch.batchId,
    jurisdiction: batch.jurisdiction,
    cutoff: batch.cutoff,
    projectCount: projects.length,
    distinctSourceDocuments: new Set(projects.flatMap((p) => p.sourceDocuments.map((d) => d.hash)))
      .size,
    publicationApproved: false as const,
    ownerMfaRequired: true as const,
    projects,
  };
}
