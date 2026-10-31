import type { Page } from '@playwright/test';
import {
  developmentOverview,
  developmentSelection,
  type DevelopmentRecord,
} from '../../src/lib/development';
export async function stubFunding(page: Page) {
  await page.route('**/api/v1/development?**', async (route) => {
    const s = developmentSelection(new URL(route.request().url()).searchParams);
    const record: DevelopmentRecord = {
      id: 'browser-fixture',
      identity: 'browser-fixture',
      edition: 'synthetic fixture',
      financialYear: s.year,
      programmeId: 'browser-fixture',
      programme: 'State Disaster Response Fund',
      budgetHead: 'fixture',
      ministry: 'Synthetic browser authority',
      jurisdiction: s.year === '2024-2025' ? '18' : '27',
      jurisdictionLabel: 'Browser-only fixture',
      purpose: 'disaster_response',
      channel: 'disaster_grant',
      instrument: 'grant',
      measure: s.measure,
      estimate: s.measure === 'allocated' ? 'original' : 'not_applicable',
      origin: 'union',
      scope: 'received',
      accountingBasis:
        s.measure === 'allocated'
          ? 'budget'
          : s.measure === 'released'
            ? 'release'
            : 'booked_expenditure',
      reconciliationKey: 'browser-fixture',
      disjointEvidence: null,
      shares: [],
      amountRupees: s.year === '2024-2025' ? '7450200000.00' : '42885000000.00',
      periodStart: s.year.slice(0, 4) + '-04-01',
      periodEnd: s.year.slice(-4) + '-03-31',
      cutoff: '2026-10-11',
      publicationDate: null,
      coverageKey: 'browser-fixture',
      aggregation: 'leaf',
      parentKey: null,
      classification: 'included',
      conflict: false,
      source: {
        hash: 'a'.repeat(64),
        url: 'https://example.invalid/browser-only-evidence',
        locator: 'Browser fixture; not a government document',
        retrievedAt: '2026-10-11T12:00:00Z',
        page: null,
      },
      notes: 'Synthetic browser test only. Never imported or published.',
    };
    await route.fulfill({ json: developmentOverview([record], s) });
  });
}
