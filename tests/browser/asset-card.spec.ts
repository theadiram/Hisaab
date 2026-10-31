import { test, expect } from './preview-fixture';
test.use({ channel: process.env.HISAAB_BROWSER_CHANNEL });
test('source photos take priority, failed photos fall back, and demo figures stay outside the real catalogue', async ({
  page,
}) => {
  const photo =
    'data:image/svg+xml,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="160"><rect fill="#285c45" width="300" height="160"/><text x="20" y="80" fill="white">Browser test source image</text></svg>',
    );
  const receipt = {
    id: 'browser-evidence',
    title: 'Browser fixture only',
    url: 'https://example.invalid/test-source',
    documentHash: '',
    locator: 'Synthetic browser fixture',
    retrievedAt: '2026-10-18',
    rawText: 'Not a government record',
    permission: 'Test only',
  };
  let broken = false;
  await page.route('**/api/v1/works/browser-visual-test', (route) =>
    route.fulfill({
      json: {
        work: {
          id: 'browser-visual-test',
          title: 'Browser fixture only',
          purpose: 'Water',
          state: 'Karnataka',
          district: 'Test',
          areaId: 'test',
          financialYear: '2025–26',
          officialIds: [],
          location: [77.101, 13.34],
          locationPrecision: 'unknown',
          authority: null,
          authorityReceipt: null,
          stages: [],
          money: [],
          physicalVerification: 'Not independently verified',
          summary: 'Synthetic browser-only fixture',
          demo: true,
          roles: [],
          media: [
            {
              id: 'test-photo',
              url: broken ? 'data:image/png;base64,invalid' : photo,
              kind: 'photo',
              caption: 'Browser fixture source photo',
              date: null,
              receipt,
            },
          ],
        },
      },
    }),
  );
  await page.goto('/?work=browser-visual-test&explore=1');
  const card = page.getByLabel('Project receipt', { exact: true });
  await expect(
    card.getByRole('heading', { name: 'Browser fixture only', exact: true }),
  ).toBeVisible();
  await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis', 'source_photo');
  await expect(card.locator('.atlas-receipt-money strong')).toHaveText(['—', '—', '—']);
  const theme = page.locator('.atlas-shell');
  const initial = await theme.getAttribute('data-theme');
  await page
    .getByRole('button', {
      name: initial === 'dark' ? 'Switch to day mode' : 'Switch to dark mode',
      exact: true,
    })
    .click();
  await page.reload();
  await expect(theme).toHaveAttribute('data-theme', initial === 'dark' ? 'light' : 'dark');
  broken = true;
  await page.reload();
  await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis', 'map_context', {
    timeout: 45000,
  });
  await card.getByRole('button', { name: 'Report an issue', exact: true }).click();
  await expect(
    page.getByText('Design demonstration only. Do not file fictional work facts.'),
  ).toBeVisible();
});

test('recorded locations get a map context preview and a moving connection without a fabricated footprint', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/asset/browser-historical-fixture?explore=1');
  const card = page.getByLabel('Project receipt', { exact: true });
  await expect(
    card.getByRole('heading', { name: 'Browser archived facility', exact: true }),
  ).toBeVisible();
  await expect(card.locator('.asset-visual')).toHaveAttribute('data-image-basis', 'map_context', {
    timeout: 45000,
  });
  await expect(card.getByText('Funding not linked', { exact: true })).toBeVisible();
  const link = page.locator('.asset-map-connection');
  await expect(link).toHaveCSS('opacity', '1');
  const before = await link.locator('path').getAttribute('d');
  // A small pan must move the leader's geographic endpoint while preserving the receipt.
  await page.mouse.move(160, 270);
  await page.mouse.down();
  await page.mouse.move(185, 295, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => link.locator('path').getAttribute('d')).not.toBe(before);
  await expect(card).toBeVisible();
  expect(errors).toEqual([]);
});
