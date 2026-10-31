import { test, expect } from './preview-fixture';
import { demoWorks } from '../../src/lib/demo';
test('project pagination and a direct receipt retain the selected identity and stage evidence', async ({
  page,
}) => {
  const work = {
    ...demoWorks[0],
    id: 'browser-test-project',
    title: 'Browser-only example road',
    financialYear: '2026-2027',
    demo: false,
  };
  await page.route('**/api/v1/works?**', (route) => {
    const p = new URL(route.request().url()).searchParams;
    return route.fulfill({ json: { works: p.get('offset') === '100' ? [work] : [], total: 101 } });
  });
  await page.route('**/api/v1/works/browser-test-project', (route) =>
    route.fulfill({ json: { work } }),
  );
  await page.goto('/?explore=1');
  await page.getByRole('button', { name: 'Explore states and projects' }).click();
  await page.locator('.drawer-left').getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: /Browser-only example road/ }).click();
  await expect(page.getByRole('complementary', { name: 'Project receipt' })).toContainText(
    work.title,
  );
  expect(new URL(page.url()).searchParams.get('work')).toBe(work.id);
  await page.reload();
  await expect(page.getByRole('heading', { name: work.title })).toBeVisible();
  await page.getByRole('button', { name: /Payment.*16 Jul/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Design fixture only');
});
test('hosted historical records keep their identity and never become invented spending', async ({
  page,
  request,
}, info) => {
  const r = await request.get('/api/v1/map/assets?bbox=79,11,80,12&mode=members');
  const data = r.ok()
      ? await r.json()
      : { assets: [{ id: 'browser-historical-fixture', title: 'Browser-only archived facility' }] },
    asset = data.assets[0];
  expect(asset).toBeTruthy();
  if (!r.ok()) {
    expect(r.status()).toBe(503);
    await page.route('**/api/v1/assets/browser-historical-fixture', (route) =>
      route.fulfill({
        json: {
          asset: {
            ...asset,
            state: 'Tamil Nadu',
            kind: 'education',
            sourceIdentity: 'fixture',
            sourceRow: 1,
            sourceHash: 'a'.repeat(64),
            sourceUrl: 'https://example.invalid/fixture',
            sourceFields: {},
            location: [79.5, 11.5],
            geometry: { type: 'Point', coordinates: [79.5, 11.5] },
            edition: 'Synthetic browser fixture',
            spendingLinked: false,
          },
        },
      }),
    );
  }
  await page.goto('/asset/' + encodeURIComponent(asset.id));
  await expect(page.getByRole('heading', { name: asset.title, exact: true })).toBeVisible({
    timeout: 20000,
  });
  await expect(page.locator('.atlas-asset-card')).toContainText('Financial records not linked');
  await expect(page.locator('.atlas-asset-card')).toContainText('Funding not linked');
  await page.getByText('Location and original source', { exact: true }).click();
  await expect(page.locator('.atlas-location-source')).toContainText('SHA-256');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `tmp/screenshots/atlas-asset-${info.project.name}.png` });
});
