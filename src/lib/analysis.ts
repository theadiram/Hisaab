import type { Work } from './model';
export function reviewQuestions(work: Work) {
  const questions: {
    category: string;
    question: string;
    evidenceIds: string[];
    uncertainty: string;
  }[] = [];
  for (const stage of work.stages) {
    if (stage.state === 'missing')
      questions.push({
        category: 'missing_record',
        question: `Which record supports the ${stage.label.toLowerCase()} stage?`,
        evidenceIds: stage.receipts.map((r) => r.id),
        uncertainty: stage.description,
      });
    if (stage.state === 'conflicting')
      questions.push({
        category: 'conflicting_records',
        question: `Please reconcile the conflicting ${stage.label.toLowerCase()} records.`,
        evidenceIds: stage.receipts.map((r) => r.id),
        uncertainty: 'Conflicting records require review; no motive is inferred.',
      });
  }
  const byId = new Map<string, Set<string>>();
  for (const e of work.money) {
    const values = byId.get(e.canonicalId) ?? new Set();
    values.add(e.amount);
    byId.set(e.canonicalId, values);
  }
  for (const [id, values] of byId)
    if (values.size > 1)
      questions.push({
        category: 'conflicting_amount',
        question: `Which amount is current for event ${id}?`,
        evidenceIds: work.money.filter((e) => e.canonicalId === id).map((e) => e.receiptId),
        uncertainty: 'Do not choose or sum conflicting versions without reconciliation.',
      });
  return questions;
}
