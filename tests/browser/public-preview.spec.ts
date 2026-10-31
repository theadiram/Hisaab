import { test, expect } from '@playwright/test';
import { stubBrowserMap } from './map-fixtures';
test.beforeEach(async ({ page }) => stubBrowserMap(page));

test('first visit defers map requests until entry and remembers this session', async ({ page }) => {
  const mapRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/geography\/|\/api\/v1\/(map|geography)|api\.mapbox\.com/.test(request.url()))
      mapRequests.push(request.url());
  });
  await page.goto('/');
  const notice = page.getByRole('dialog', { name: 'Hisaab is still under development.' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Project data collected');
  const enter = notice.getByRole('button', { name: 'I understand — explore Hisaab' });
  await expect(enter).toBeFocused();
  await expect(page.locator('.atlas-shell')).toHaveCount(0);
  expect(mapRequests).toHaveLength(0);
  await enter.click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('.atlas-shell')).toBeVisible();
  expect(
    await page.locator('.atlas-shell').evaluate((element) => !!element.closest('[inert]')),
  ).toBe(false);
  await page.reload();
  await expect(notice).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explore India', exact: true })).toBeVisible();
});
