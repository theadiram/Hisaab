import type { Page } from '@playwright/test';
import sharp from 'sharp';
import type { AssetDetail } from '../../src/lib/asset-geography';

// Browser-only evidence: never written to the catalogue or used by the app server.
export const archivedFixture: AssetDetail = {
  id: 'browser-historical-fixture',
  kind: 'public',
  title: 'Browser archived facility',
  category: 'Synthetic test facility',
  state: 'Test state',
  location: [82.65, 22.7],
  sourceIdentity: 'BROWSER-ONLY-1',
  sourceRow: 1,
  sourceHash: 'a'.repeat(64),
  sourceUrl: 'https://example.invalid/browser-only-source',
  sourceFile: 'synthetic-browser-fixture',
  geometry: { type: 'Point', coordinates: [82.65, 22.7] },
  sourceFields: { note: 'Synthetic browser fixture, not a government record' },
  edition: 'Browser fixture only',
  delivery: 'Synthetic browser response',
  textReview: false,
  locationVerification: 'unreviewed_source_coordinate',
  spendingLinked: false,
  photos: [],
  buildingFootprint: null,
};
let images: Promise<{ raster: Buffer; dem: Buffer }> | undefined;
function fixtureImages() {
  return (images ??= Promise.all([
    sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#28643d"/><stop offset=".5" stop-color="#e0ba7b"/><stop offset="1" stop-color="#326eac"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#f4f0db" stroke-width="4"/></svg>',
      ),
    )
      .png()
      .toBuffer(),
    sharp({
      create: { width: 256, height: 256, channels: 3, background: { r: 1, g: 134, b: 160 } },
    })
      .png()
      .toBuffer(),
  ]).then(([raster, dem]) => ({ raster, dem })));
}
export async function stubBrowserMap(page: Page) {
  const image = await fixtureImages();
  await page.route('https://api.mapbox.com/**', (route) => {
    const url = route.request().url();
    if (url.includes('/styles/v1/'))
      return route.fulfill({
        json: {
          version: 8,
          sources: {
            fixture: {
              type: 'raster',
              tiles: ['https://browser-fixture.invalid/raster/{z}/{x}/{y}.png'],
              tileSize: 256,
              maxzoom: 18,
            },
          },
          layers: [{ id: 'synthetic-basemap', type: 'raster', source: 'fixture' }],
        },
      });
    if (url.includes('terrain-dem-v1.json'))
      return route.fulfill({
        json: {
          tilejson: '2.2.0',
          tiles: ['https://browser-fixture.invalid/dem/{z}/{x}/{y}.png'],
          minzoom: 0,
          maxzoom: 14,
        },
      });
    return route.fulfill({ body: Buffer.alloc(0) });
  });
  await page.route('https://events.mapbox.com/**', (route) => route.fulfill({ status: 204 }));
  await page.route('https://browser-fixture.invalid/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: route.request().url().includes('/dem/') ? image.dem : image.raster,
    }),
  );
  await page.route('**/api/v1/assets/browser-historical-fixture', (route) =>
    route.fulfill({ json: { asset: archivedFixture } }),
  );
  await page.route('**/api/v1/assets/browser-historical-fixture/projects', (route) =>
    route.fulfill({ json: { works: [] } }),
  );
  await page.route('**/api/v1/map/asset-tiles/**', (route) =>
    route.fulfill({ contentType: 'application/vnd.mapbox-vector-tile', body: Buffer.alloc(0) }),
  );
}
