import { test, expect } from './preview-fixture';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const overview = JSON.parse(readFileSync('data/map-overview.json', 'utf8'));

test('country summaries defer individual tiles, expand on click, and preserve detailed access', async ({
  page,
}) => {
  const tileRequests: string[] = [],
    metadataRequests: string[] = [],
    pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/asset-tiles/')) tileRequests.push(request.url());
    if (request.url().endsWith('/api/v1/geography')) metadataRequests.push(request.url());
  });
  // Isolate our delivery behaviour from the commercial basemap and terrain.
  await page.route('https://api.mapbox.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/fonts/v1/')) return route.fulfill({ status: 200, body: Buffer.alloc(0) });
    if (url.includes('/styles/v1/'))
      return route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            { id: 'test-background', type: 'background', paint: { 'background-color': '#20373b' } },
          ],
        },
      });
    if (url.includes('terrain-dem-v1.json'))
      return route.fulfill({
        json: {
          tilejson: '2.2.0',
          tiles: ['https://api.mapbox.com/test-dem/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 14,
        },
      });
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('**/api/v1/map/asset-tiles/**', (route) =>
    route.fulfill({ contentType: 'application/vnd.mapbox-vector-tile', body: Buffer.alloc(0) }),
  );
  await page.route('**/api/v1/geography', (route) =>
    route.fulfill({ json: { count: 812976, maxzoom: 9 } }),
  );
  await page.route('**/api/v1/map/assets?**', (route) =>
    route.fulfill({ json: { total: 812976, assets: [] } }),
  );
  await page.goto('/?explore=1');
  const canvas = page.locator('.map-canvas');
  await expect(canvas).toHaveAttribute('data-zoom', /\d/, { timeout: 20000 });
  await page.getByRole('button', { name: 'Map settings and layers', exact: true }).click();
  await expect(
    page.getByText('archived locations in grouped summaries', { exact: false }),
  ).toBeVisible();
  expect(metadataRequests).toHaveLength(0);
  expect(tileRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Map settings and layers', exact: true }).click();
  const zoom = Number(await canvas.getAttribute('data-zoom'));
  const summary = JSON.parse(
    readFileSync('public' + overview.urlTemplate.replace('{z}', String(Math.floor(zoom))), 'utf8'),
  );
  const [lng, lat] = (await canvas.getAttribute('data-center'))!.split(',').map(Number);
  const feature = summary.features
    .filter(
      (f: any) =>
        f.geometry.coordinates[0] > 75 &&
        f.geometry.coordinates[0] < 88 &&
        f.geometry.coordinates[1] > 15 &&
        f.geometry.coordinates[1] < 28,
    )
    .sort(
      (a: any, b: any) =>
        Math.hypot(a.geometry.coordinates[0] - lng, a.geometry.coordinates[1] - lat) -
        Math.hypot(b.geometry.coordinates[0] - lng, b.geometry.coordinates[1] - lat),
    )[0];
  const point = feature.geometry.coordinates;
  const world = (lng: number, lat: number) => [
    (lng + 180) / 360,
    (1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2,
  ];
  const a = world(lng, lat),
    b = world(point[0], point[1]),
    box = (await canvas.boundingBox())!,
    scale = 512 * 2 ** zoom;
  const sx = box.width / 2 + (b[0] - a[0]) * scale,
    sy = box.height / 2 + 15 + (b[1] - a[1]) * scale;
  await expect
    .poll(
      async () => {
        const bytes = await page.screenshot({
          clip: { x: box.x + sx - 22, y: box.y + sy - 22, width: 44, height: 44 },
        });
        const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
        let green = 0;
        for (let i = 0; i < data.length; i += info.channels)
          if (data[i] > 120 && data[i + 1] > 180 && data[i + 2] < 170) green++;
        return green;
      },
      { timeout: 15000 },
    )
    .toBeGreaterThan(100);
  await canvas.click({
    position: {
      x: box.width / 2 + (b[0] - a[0]) * scale,
      y: box.height / 2 + 15 + (b[1] - a[1]) * scale,
    },
  });
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-zoom')))
    .toBeGreaterThan(zoom + 0.2);
  await expect(page.locator('.atlas-state-card')).toHaveCount(0);
  for (let i = 0; i < 7 && Number(await canvas.getAttribute('data-zoom')) < 6; i++) {
    const before = Number(await canvas.getAttribute('data-zoom'));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).first().click();
    await expect
      .poll(async () => Number(await canvas.getAttribute('data-zoom')))
      .toBeGreaterThan(before + 0.5);
  }
  await expect.poll(() => tileRequests.length).toBeGreaterThan(0);
  expect(
    tileRequests.every((url) => Number(url.split('/asset-tiles/')[1].split('/')[0]) >= 6),
  ).toBe(true);
  expect(pageErrors).toEqual([]);
});
