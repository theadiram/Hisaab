import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/reports', () => ({ reportClient: () => ({ rpc }) }));
import { operatingLimit } from '../src/lib/operating-limits';
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('HISAAB_DATA_MODE', 'supabase');
  vi.stubEnv('HISAAB_CAPABILITY_SECRET', 'test-secret');
  vi.stubEnv('HISAAB_TRUST_PROXY_IP', 'true');
  vi.stubEnv('HISAAB_TRUST_NETLIFY_IP', 'false');
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it('rejects caller forwarding headers without a trusted proxy identity', async () => {
  expect(
    await operatingLimit(
      new Request('https://adiram.me', {
        headers: { 'x-forwarded-for': '1.2.3.4', 'x-nf-client-connection-ip': '1.2.3.4' },
      }),
      'test',
    ),
  ).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
it('accepts a validated identity supplied by the configured loopback proxy', async () => {
  expect(
    await operatingLimit(
      new Request('https://adiram.me', { headers: { 'x-hisaab-client-ip': '1.2.3.4' } }),
      'test',
    ),
  ).toBe(true);
  expect(rpc).toHaveBeenCalledOnce();
});
it('rejects invalid proxy identities', async () => {
  expect(
    await operatingLimit(
      new Request('https://adiram.me', { headers: { 'x-hisaab-client-ip': 'spoofed' } }),
      'test',
    ),
  ).toBe(false);
  expect(rpc).not.toHaveBeenCalled();
});
it('fails closed if database limits are unavailable', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
  expect(
    await operatingLimit(
      new Request('https://adiram.me', { headers: { 'x-hisaab-client-ip': '1.2.3.4' } }),
      'test',
    ),
  ).toBe(false);
});
