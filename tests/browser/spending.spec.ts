import { test, expect } from './preview-fixture';
import { readFile } from 'node:fs/promises';

test('national sector coverage shows acquisition and keeps budget amounts private', async ({
  page,
  request,
}) => {
  const stored = JSON.parse(await readFile('data/union-budget-acquisition.json', 'utf8'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await page.getByRole('button', { name: 'Evidence progress and data acquisition' }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Every purpose. Across India.' }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const response = await request.get('/api/v1/spending');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  const body = await response.json();
  expect(body.budget.pdfCheckedDemands).toBe(stored.pdfCheckedDemands);
  expect(body.budget.financialContextRows).toBe(stored.financialContextRows);
  expect(body.sectors).toHaveLength(12);
  expect(JSON.stringify(body)).not.toMatch(
    /"(?:totalCrore|revenueCrore|capitalCrore|documentHash|sha256|storage_path|rawText|department|locator)"\s*:/,
  );
  expect(body.sectors.find((s: { id: string }) => s.id === 'railways').workCandidates).toBeNull();
  const privateResponse = await request.get('/api/v1/admin/budget');
  expect(privateResponse.status()).toBe(401);
  expect(privateResponse.headers()['cache-control']).toBe('private, no-store');
});

test('financial review distinguishes periods and shows exact source context without implying payment', async ({
  page,
}) => {
  const row = {
    identity: 'fixture:actual',
    demandNumber: 85,
    department: 'Disposable Railways context',
    financialYear: '2024-2025',
    measure: 'actual',
    revenueCrore: '1.00',
    capitalCrore: null,
    totalCrore: '1.00',
    locator: 'Disposable sheet row 13; PDF page 1',
    pdfPage: 1,
    sourceDocument: {
      id: 'fixture',
      url: 'https://example.invalid/fixture.pdf',
      hash: 'a'.repeat(64),
      permissionReviewed: false,
    },
  };
  await page.route('**/api/v1/admin/budget?**', async (route) => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset'));
    await route.fulfill({
      json: {
        records: offset
          ? []
          : [
              row,
              {
                ...row,
                identity: 'fixture:be',
                measure: 'budget_estimate',
                financialYear: '2026-2027',
                totalCrore: '2.00',
                revenueCrore: '2.00',
              },
            ],
        totalDemands: 21,
      },
    });
  });
  await page.goto('/admin/finance');
  await expect(page.getByRole('heading', { name: 'Before the work, the budget.' })).toBeVisible();
  await expect(page.getByText('Reported actuals', { exact: true })).toBeVisible();
  await expect(page.getByText('Budget estimate', { exact: true })).toBeVisible();
  await page.getByText('Revenue and capital', { exact: true }).first().click();
  await expect(page.getByText('Capital: Not specified').first()).toBeVisible();
  await page.getByText('Original evidence and scope', { exact: true }).click();
  await expect(page.getByText('Source republication permission is pending.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open authoritative PDF · page 1' })).toHaveAttribute(
    'href',
    'https://example.invalid/fixture.pdf#page=1',
  );
  await expect(page.getByRole('button', { name: /Publish/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Next departments' }).click();
  await expect(page.getByText('21 demand statements · 0 shown')).toBeVisible();
});
