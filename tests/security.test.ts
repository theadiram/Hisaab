import { it, expect } from 'vitest';
import { equalSecret, requireOrigin } from '../src/lib/security';
it('compares secrets safely', () => {
  expect(equalSecret('secret', 'secret')).toBe(true);
  expect(equalSecret('secret', 'other')).toBe(false);
});
it('rejects a cross-site mutation and missing origin', () => {
  expect(
    requireOrigin(
      new Request('https://adiram.me/api', {
        headers: { host: 'adiram.me', origin: 'https://evil.example' },
      }),
    ),
  ).toBe(false);
  expect(requireOrigin(new Request('https://adiram.me/api'))).toBe(false);
  expect(
    requireOrigin(
      new Request('https://adiram.me/api', {
        headers: { host: 'adiram.me', origin: 'https://adiram.me' },
      }),
    ),
  ).toBe(true);
});
