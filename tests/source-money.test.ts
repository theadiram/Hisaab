import { describe, expect, it } from 'vitest';
import { sourceRupees } from '../src/lib/source-money';
describe('preserved source amounts', () => {
  it('does not lose paise above the safe integer range or hide extra source decimals', () => {
    expect(sourceRupees('9007199254740993.01')).toBe('₹9,00,71,99,25,47,40,993.01');
    expect(sourceRupees('1234.005')).toBe('₹1,234.005');
  });
  it('does not substitute zero for missing or invalid money', () => {
    expect(sourceRupees(null)).toBe('Amount unavailable');
    expect(sourceRupees('NaN')).toBe('Amount unavailable');
  });
});
