import 'server-only';
import { publicDb } from './public-db';
import { readCatalogue } from './catalogue';
export async function financialCoverage() {
  const catalogue = await readCatalogue();
  const kinds = ['sanction', 'award', 'payment', 'completion'] as const;
  if (catalogue.mode === 'supabase') {
    const db = publicDb();
    const filters = ['sanction', 'contract', 'payment']
      .map(
        (measure) =>
          `payload.cs.${JSON.stringify(JSON.stringify({ money: [{ approved: true, measure }] }))}`,
      )
      .join(',');
    const [financial, payments, ...stages] = await Promise.all([
      db
        .from('published_work_receipts')
        .select('work_id', { count: 'exact', head: true })
        .or(filters),
      db
        .from('published_work_receipts')
        .select('work_id', { count: 'exact', head: true })
        .or(
          ['transaction', 'reversal']
            .map(
              (kind) =>
                `payload.cs.${JSON.stringify(JSON.stringify({ money: [{ approved: true, measure: 'payment', kind }] }))}`,
            )
            .join(','),
        ),
      ...kinds.map((id) =>
        db
          .from('published_work_receipts')
          .select('work_id', { count: 'exact', head: true })
          .contains('payload', { stages: [{ id, state: 'found' }] }),
      ),
    ]);
    if ([financial, payments, ...stages].some((r) => r.error || r.count === null))
      throw new Error('Financial evidence counts unavailable');
    return {
      publishedWorks: catalogue.totalWorks,
      withFinancialRecords: financial.count!,
      withPaymentDetails: payments.count!,
      missingStages: Object.fromEntries(
        kinds.map((id, i) => [id, catalogue.totalWorks - stages[i].count!]),
      ),
      lastPublishedAt: catalogue.publishedAt,
      checkedAt: new Date().toISOString(),
      scope:
        'Published catalogue across all pages. Payment details require approved individual transaction or reversal records; cumulative expenditure is excluded.',
    };
  }
  const works = catalogue.works;
  return {
    publishedWorks: works.length,
    withFinancialRecords: works.filter((w) => w.money.some((e) => e.approved && e.receiptId))
      .length,
    withPaymentDetails: works.filter((w) =>
      w.money.some(
        (e) => e.approved && e.receiptId && e.measure === 'payment' && e.kind !== 'cumulative',
      ),
    ).length,
    missingStages: Object.fromEntries(
      kinds.map((id) => [
        id,
        works.filter((w) => !w.stages.some((s) => s.id === id && s.state === 'found')).length,
      ]),
    ),
    lastPublishedAt: catalogue.publishedAt,
    checkedAt: new Date().toISOString(),
    scope:
      'Published catalogue. Cumulative expenditure is excluded from individual payment coverage.',
  };
}
