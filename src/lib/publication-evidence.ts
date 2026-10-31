import type { Work } from './model';
export function assertPublicationEvidence(work: Work) {
  const receipts = new Set(work.stages.flatMap((s) => s.receipts.map((r) => r.id)));
  for (const stage of work.stages) {
    if (stage.state === 'found' && (stage.reviewStatus !== 'verified' || !stage.receipts.length))
      throw new Error('Found stages require explicit verified evidence review.');
    if (stage.id === 'completion' && stage.state === 'found' && !stage.completionBasis)
      throw new Error('Label completion as reported or certificate-backed.');
  }
  for (const event of work.money) {
    if (!event.approved) continue;
    if (event.reviewStatus !== 'verified' || !receipts.has(event.receiptId))
      throw new Error('Approved financial entries require explicit source review.');
    const stage = work.stages.find(
      (s) =>
        s.id ===
        (event.measure === 'contract'
          ? 'award'
          : event.measure === 'sanction'
            ? 'sanction'
            : 'payment'),
    );
    if (stage?.state !== 'found' || stage.reviewStatus !== 'verified')
      throw new Error('Approved amount requires its reviewed financial stage.');
    if (event.measure === 'payment' && event.kind !== 'cumulative') {
      if (
        !event.date ||
        !event.sourcePaymentId ||
        !event.allocation ||
        event.allocation.projectId !== work.id ||
        event.allocation.amount !== event.amount ||
        !receipts.has(event.allocation.receiptId) ||
        event.flow !== 'contractor_payment' ||
        !['gross', 'net'].includes(event.amountBasis ?? '') ||
        !event.payee
      )
        throw new Error(
          'Individual payments require official project allocation, recipient and gross/net evidence.',
        );
    }
  }
}
