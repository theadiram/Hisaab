import { defineConfig } from '@playwright/test';
import { testDatabaseUrl } from './tests/browser/test-environment';
const databaseUrl = testDatabaseUrl();
export default defineConfig({
  testDir: 'tests/browser',
  workers: 2,
  use: {
    channel: process.env.HISAAB_BROWSER_CHANNEL,
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: 'pk.browser-fixture',
      NEXT_PUBLIC_HISAAB_MAP_TILE_BASE_URL: '',
      SUPABASE_URL: databaseUrl,
      NEXT_PUBLIC_SUPABASE_URL: databaseUrl,
      HISAAB_DATA_MODE: 'supabase',
      HISAAB_APP_ORIGIN: 'http://127.0.0.1:3000',
      HISAAB_PUBLIC_RELEASE: 'false',
    },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
