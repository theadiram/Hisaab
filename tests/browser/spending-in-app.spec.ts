import { test, expect } from './preview-fixture';
test('development sectors stay in the app and return to the map', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Explore India', exact: true }).click();
  await page.getByRole('button', { name: 'Evidence progress and data acquisition' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Every purpose. Across India.' })).toBeVisible();
  await expect(dialog.locator('.app-sector-grid>button')).toHaveCount(12);
  await expect(
    dialog.getByRole('heading', { name: 'Delhi evidence coverage', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Whole Delhi is not yet complete', { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('heading', {
      name: 'Selected unit: South East Road Division 2 (SER-2)',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByText('First pilot: South East Road Division 2 (SER-2).', { exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: /Hospitals & health/ }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Hospitals & health', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Next evidence needed')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');
  await dialog.getByRole('button', { name: 'All development sectors' }).click();
  await dialog.getByRole('button', { name: /Roads & bridges/ }).click();
  await dialog.getByRole('button', { name: 'Explore published works' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Development purpose')).toHaveValue('transport');
  expect(new URL(page.url()).pathname).toBe('/');
  await page.getByRole('button', { name: 'Evidence progress and data acquisition' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
