import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { getShowcaseWork } from '../src/lib/showcase-work';
import { kebaliCardDemo, kebaliAssetId } from '../src/lib/kebali-card-demo';
import { aggregateMoney } from '../src/lib/money';

describe('isolated archived-asset showcase', () => {
  it('does not resolve a real archive ID as a financial fixture', () => {
    expect(getShowcaseWork(kebaliAssetId)).toBeNull();
    expect(getShowcaseWork(null)).toBeNull();
    expect(getShowcaseWork(kebaliCardDemo.id)?.demo).toBe(true);
  });
  it('keeps the source point while marking all financial evidence as invented', () => {
    expect(kebaliCardDemo.assetId).toBe(kebaliAssetId);
    expect(kebaliCardDemo.location).toEqual([95.848635, 28.162476666667]);
    for (const receipt of kebaliCardDemo.stages.flatMap((s) => s.receipts)) {
      expect(receipt.url).toBe('');
      expect(receipt.locator).toContain('SHOWCASE ONLY');
    }
    expect(kebaliCardDemo.demoProfile?.recipientPhone).toContain('not dialable');
    expect(kebaliCardDemo.demoProfile?.recipientEmail).toMatch(/\.invalid$/);
  });
  it('reconciles gross less deductions to net for every sample payment', () => {
    for (const r of kebaliCardDemo.demoProfile!.paymentBreakdown)
      expect(new Decimal(r.gross).minus(r.deductions).eq(r.net)).toBe(true);
    expect(aggregateMoney(kebaliCardDemo.money, 'sanction').amount).toBe('3200000.00');
    expect(aggregateMoney(kebaliCardDemo.money, 'contract').amount).toBe('3000000.00');
    expect(aggregateMoney(kebaliCardDemo.money, 'payment').amount).toBe('2850000.00');
  });
});
