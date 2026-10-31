import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { publicDb } from '../src/lib/public-db';
import { reportClient } from '../src/lib/reports';
import { adminClient } from '../src/lib/admin';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it('treats an empty optional catalogue URL as unconfigured', async () => {
  vi.stubEnv('HISAAB_CATALOGUE_API_URL', '  ');
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:59999');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
  const client = publicDb();
  expect(client.supabaseUrl).toBe('http://127.0.0.1:59999');
  await client.auth.stopAutoRefresh();
});
it('does not leave background refresh timers behind for request-scoped database clients', async () => {
  vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:59999');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-public-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-private-key');
  const timer = vi.spyOn(globalThis, 'setInterval');
  const clients = Array.from({ length: 20 }, () => [
    publicDb(),
    reportClient(),
    adminClient('test-admin-token'),
  ]).flat();
  try {
    await Promise.all(clients.map((c) => c.auth.getSession()));
    expect(timer).not.toHaveBeenCalled();
  } finally {
    await Promise.all(clients.map((c) => c.auth.stopAutoRefresh()));
  }
});
it('routes public reads to a dedicated API without redirecting owner or private clients', async () => {
  vi.stubEnv('SUPABASE_URL', 'https://auth-and-storage.example.invalid');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'original-public-key');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'original-private-key');
  vi.stubEnv('HISAAB_CATALOGUE_API_URL', 'http://127.0.0.1:3102');
  vi.stubEnv('HISAAB_CATALOGUE_API_KEY', 'catalogue-only-key');
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input instanceof Request ? input.url : input));
      return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
    }),
  );
  try {
    await publicDb().rpc('catalogue_summary');
    await adminClient('test-token').rpc('admin_context');
    await reportClient().rpc('read_private_case', { p_hash: 'test' });
    expect(urls).toEqual([
      'http://127.0.0.1:3102/rest/v1/rpc/catalogue_summary',
      'https://auth-and-storage.example.invalid/rest/v1/rpc/admin_context',
      'https://auth-and-storage.example.invalid/rest/v1/rpc/read_private_case',
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('rejects a dedicated API configured without its own key', () => {
  vi.stubEnv('HISAAB_CATALOGUE_API_URL', 'http://127.0.0.1:3102');
  vi.stubEnv('HISAAB_CATALOGUE_API_KEY', '');
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'original-key-must-not-be-used');
  expect(() => publicDb()).toThrow('Published catalogue connection unavailable');
});
