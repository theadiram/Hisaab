import { test, expect } from './preview-fixture';
import { stubFunding } from './atlas-fixtures';
test.beforeEach(async ({ page }) => stubFunding(page));
test('clean India opens into a state card with independent historical and funding layers', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.locator('.atlas-shell')).toHaveAttribute('data-exploring', 'false');
  await expect(page.getByLabel('Financial year', { exact: true })).toHaveCount(0);
  await expect(page.locator('.atlas-state-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await expect(page.getByLabel('Financial year', { exact: true }).locator('option')).toHaveCount(
    11,
  );
  await expect(page.locator('.atlas-state-list>button')).toHaveCount(36);
  await page.getByLabel('Financial year', { exact: true }).selectOption('2024-2025');
  await page.getByRole('button', { name: 'Released', exact: true }).click();
  await page
    .locator('.atlas-state-list')
    .getByRole('button', { name: 'Assam', exact: true })
    .click();
  await expect(page.locator('.atlas-state-card')).toContainText('₹745.02 crore', {
    timeout: 20000,
  });
  await expect(page.locator('.atlas-state-card')).toContainText(
    'A reconciled combined amount is not available.',
  );
  await expect(page.locator('.atlas-state-card')).toContainText('Funding received by the state');
  expect(new URL(page.url()).pathname).toBe('/state/18');
  await page.getByRole('button', { name: 'Map settings and layers' }).click();
  const historic = page.getByRole('button', { name: /Historical locations.*812,976/ }),
    funding = page.getByRole('button', { name: /Funding colours.*Recorded development/ });
  await expect(historic).toHaveAttribute('aria-pressed', 'true');
  await expect(funding).toHaveAttribute('aria-pressed', 'false');
  await funding.click();
  await historic.click();
  await expect(funding).toHaveAttribute('aria-pressed', 'true');
  await expect(historic).toHaveAttribute('aria-pressed', 'false');
  await historic.click();
  await page.getByRole('button', { name: 'Close controls' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `tmp/screenshots/atlas-state-${info.project.name}.png` });
});
test('published funding opens an evidence panel and keeps programme sources in the app', async ({
  page,
}) => {
  await page.goto('/state/27');
  const record = page
    .locator('.atlas-programme-row')
    .filter({ hasText: 'State Disaster Response Fund' });
  await expect(record).toBeVisible({ timeout: 20000 });
  await record.click();
  const dialog = page.getByRole('dialog', { name: 'Programme evidence' });
  await expect(dialog).toContainText('₹4288.50 crore');
  await expect(dialog).toContainText('Funding received');
  await expect(dialog.getByRole('link', { name: 'Original document' })).toHaveAttribute(
    'href',
    /example.invalid/,
  );
  await expect(dialog.getByRole('button', { name: 'Close evidence panel' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(record).toBeFocused();
});
test('funding privacy and failure semantics remain explicit', async ({ request }) => {
  expect((await request.get('/api/v1/funding?year=2015-2016')).status()).toBe(400);
  const response = await request.get('/api/v1/development');
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.coverage.complete).toBe(false);
  expect(data.states).toHaveLength(36);
  expect(
    data.states.every(
      (s: { development: { combinedAmountRupees: string | null } }) =>
        s.development.combinedAmountRupees === null ||
        typeof s.development.combinedAmountRupees === 'string',
    ),
  ).toBe(true);
  for (const path of [
    '/api/v1/admin/funding',
    '/api/v1/admin/funding/inventory',
    '/api/v1/admin/intake',
    '/api/v1/admin/development',
    '/api/v1/admin/complaints',
    '/api/v1/admin/complaints/evidence?id=invalid',
  ])
    expect((await request.get(path)).status()).toBe(401);
  const meta = await (await request.get('/api/v1/funding/coverage')).json();
  expect(meta.editions).toHaveLength(11);
  expect(JSON.stringify(meta)).not.toContain('amountRupees');
});
test('non-WebGL fallback preserves selectable states and sources', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type.startsWith('webgl')) return null;
      return get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await page
    .locator('.atlas-state-list')
    .getByRole('button', { name: 'Delhi', exact: true })
    .click();
  await expect(
    page.locator('.atlas-state-card').getByRole('heading', { name: 'Delhi', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.atlas-map-error')).toContainText('cannot render');
});
