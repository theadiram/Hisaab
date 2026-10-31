import { test, expect } from './preview-fixture';
test('two-year state evidence stays inside Spending with MFA and distinct amounts', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/v1/evidence-progress') && r.status() === 200,
    ),
    page.getByRole('button', { name: 'Evidence progress and data acquisition' }).click(),
  ]);
  const section = page.getByRole('region', { name: 'Two-year state development collection' });
  await expect(
    section.getByRole('heading', { name: 'State-by-state development collection' }),
  ).toBeVisible();
  await expect(section.getByLabel('State', { exact: true }).locator('option')).toHaveCount(28);
  // Server authorization is covered by API tests and a separate live 401 check.
  // Keep this browser interaction deterministic under concurrent WebGL load.
  await page.route('**/api/v1/admin/state-development?**', (route) =>
    route.fulfill({
      status: 401,
      json: { error: 'Owner MFA sign-in required to inspect collected state evidence.' },
    }),
  );
  await section.getByRole('button', { name: 'Inspect collected evidence' }).click();
  await expect(section.getByRole('alert')).toContainText('Owner MFA sign-in required');
  // Synthetic browser-only data exercises rendering, never server publication.
  await page.route('**/api/v1/admin/state-development?**', async (route) => {
    const p = new URL(route.request().url()).searchParams;
    if (p.get('section') === 'cards') {
      await route.fulfill({
        json: {
          state: { code: '28', name: 'Andhra Pradesh' },
          section: 'cards',
          page: 1,
          pageSize: 25,
          total: 1,
          approved: false,
          rows: [
            {
              id: 'synthetic-card',
              card: {
                id: 'synthetic-card',
                title: 'Synthetic project card for browser testing',
                stateCode: '28',
                evidenceLabel: 'Tender notice',
                stage: 'tender_notice',
                projectReference: 'TEST-ONLY-01',
                identityBasis: 'official_tender_reference',
                financialYear: null,
                projectCostRupees: null,
                contractAmountRupees: null,
                contractorName: null,
                awardDate: null,
                awardFieldAsPrinted: null,
                bidClosingDate: '17-Oct-2026',
                reportingCutoff: null,
                retrievedAt: '2026-10-15',
                source: {
                  url: 'https://example.invalid/browser-fixture',
                  locator: 'Synthetic browser fixture only',
                },
                sourceFactsComparison: {
                  priority: 'contract_facts_first',
                  originalTableMatched: true,
                },
                paymentEvidence: 'not_reviewed',
                locationEvidence: 'not_reviewed',
                completionEvidence: 'not_reviewed',
                developmentClassification: 'awaiting_review',
                publicationApproved: false,
              },
            },
          ],
        },
      });
      return;
    }
    const budget = p.get('section') === 'budget';
    if (p.get('state') === '36') {
      await route.fulfill({
        json: {
          state: { code: '36', name: 'Telangana' },
          section: 'budget',
          page: 1,
          pageSize: 25,
          total: 1,
          approved: false,
          rows: [
            {
              id: 'synthetic-department',
              purposeLabel: 'Synthetic department allocation',
              financialYear: '2026-2027',
              measure: 'allocated',
              estimate: 'original',
              amountRupees: '301.00',
              components: [
                { label: 'Establishment', amountRupees: '100.00' },
                { label: 'Scheme', amountRupees: '200.00' },
              ],
              printedArithmeticDifferenceCrore: '0.0000001',
              source: {
                url: 'https://example.invalid/browser-fixture',
                locator: 'Synthetic test only',
              },
            },
          ],
        },
      });
      return;
    }
    await route.fulfill({
      json: {
        state: { code: '28', name: 'Andhra Pradesh' },
        section: p.get('section'),
        page: 1,
        pageSize: 25,
        total: 1,
        approved: false,
        rows: [
          budget
            ? {
                id: 'synthetic-budget',
                purposeLabel: 'Synthetic education allocation',
                financialYear: '2026-2027',
                measure: 'allocated',
                estimate: 'original',
                amountRupees: '100.10',
                revenueRupees: '60.00',
                capitalRupees: '40.10',
                printedArithmeticDifferenceCrore: '0.00',
                source: {
                  url: 'https://example.invalid/browser-fixture',
                  locator: 'Synthetic test only',
                },
              }
            : {
                id: 'synthetic-actual',
                purposeLabel: 'Synthetic expenditure',
                financialYear: '2025-2026',
                measure: 'reported_spent',
                amountRupees: '80.00',
                periodStart: '2025-04-01',
                periodEnd: '2026-03-31',
                source: {
                  url: 'https://example.invalid/browser-fixture',
                  locator: 'Synthetic test only',
                },
              },
        ],
      },
    });
  });
  await section.getByRole('button', { name: 'Inspect collected evidence' }).click();
  const card = section.getByRole('article', { name: 'Synthetic project card for browser testing' });
  await expect(card).toBeVisible();
  await expect(card.getByText('Tender notice', { exact: true })).toBeVisible();
  await expect(card.getByText('Private draft', { exact: true })).toBeVisible();
  await expect(card.getByText('Original-source comparison passed.', { exact: true })).toBeVisible();
  await card.getByText('Evidence still needed for a spending card', { exact: true }).click();
  await expect(
    card.getByText('Project-allocated payment amount, payment date and recipient.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(card.getByRole('link', { name: 'Read original source' })).toHaveAttribute(
    'href',
    'https://example.invalid/browser-fixture',
  );
  await section.getByLabel('Evidence', { exact: true }).selectOption('budget');
  await section.getByRole('button', { name: 'Inspect collected evidence' }).click();
  await section.getByText('Synthetic education allocation', { exact: true }).click();
  await expect(section.getByText('₹100.10', { exact: true })).toBeVisible();
  await expect(
    section.getByText('Components of the total; do not add them again.', { exact: false }),
  ).toBeVisible();
  await section.getByLabel('State', { exact: true }).selectOption('36');
  await section.getByRole('button', { name: 'Inspect collected evidence' }).click();
  await section.getByText('Synthetic department allocation', { exact: true }).click();
  await expect(section.getByText('₹301.00', { exact: true })).toBeVisible();
  await expect(section.getByText('Establishment: ₹100.00', { exact: false })).toBeVisible();
  await section.getByLabel('State', { exact: true }).selectOption('28');
  await section.getByLabel('Evidence', { exact: true }).selectOption('expenditure');
  await section.getByRole('button', { name: 'Inspect collected evidence' }).click();
  await section.getByText('Synthetic expenditure', { exact: true }).click();
  await expect(section.getByText('₹80.00', { exact: true })).toBeVisible();
  await expect(section.getByText('2025-04-01 to 2026-03-31', { exact: false })).toBeVisible();
  const territories = page.getByRole('region', {
    name: 'Two-year union territory development collection',
  });
  await expect(
    territories.getByRole('heading', { name: 'Union-territory development collection' }),
  ).toBeVisible();
  await expect(
    territories.getByLabel('Union territory', { exact: true }).locator('option'),
  ).toHaveCount(8);
  await territories.getByLabel('Union territory', { exact: true }).selectOption('37');
  await expect(territories.getByLabel('Union territory', { exact: true })).toHaveValue('37');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
