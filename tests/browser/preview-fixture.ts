import { test as base, expect } from '@playwright/test';

import { stubBrowserMap } from './map-fixtures';

// Existing journeys exercise the map as a returning visitor. The entry notice
// itself is covered separately without this acknowledgement fixture.
export const test = base.extend<{ acknowledgedPreview: void }>({
  acknowledgedPreview: [
    async ({ context, page }, use) => {
      await context.route('https://events.mapbox.com/**', (route) =>
        route.fulfill({ status: 204 }),
      );
      await context.addInitScript(() => {
        try {
          sessionStorage.setItem('hisaab-public-preview-project-data-2026-10-26', 'understood');
        } catch {}
      });
      await stubBrowserMap(page);
      await use();
    },
    { auto: true },
  ],
});
export { expect };
