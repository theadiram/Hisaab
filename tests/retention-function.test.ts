import { afterEach, expect, it, vi } from 'vitest';
import retention from '../netlify/functions/retention.mjs';
afterEach(() => vi.unstubAllEnvs());
it('scheduled retention deletes nothing while migration writes are paused', async () => {
  vi.stubEnv('HISAAB_RETENTION_ENABLED', 'true');
  vi.stubEnv('HISAAB_MIGRATION_READ_ONLY', 'true');
  vi.stubEnv('SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  await expect(retention()).resolves.toBeUndefined();
  expect(log).toHaveBeenCalledWith(JSON.stringify({ retention: 'paused' }));
});
