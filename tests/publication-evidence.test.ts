import { describe, it, expect } from 'vitest';
import { assertPublicationEvidence } from '../src/lib/publication-evidence';
import { normalizeAmount, aggregateMoney } from '../src/lib/money';
import type { Work, MoneyEvent } from '../src/lib/model';
const base = () =>
  ({
    id: 'road-1',
    stages: [{ id: 'payment', state: 'missing', receipts: [] }],
    money: [],
  }) as unknown as Work;
describe('explicit publication evidence', () => {
  it('preserves missing stages rather than claiming evidence', () => {
    const w = base();
    assertPublicationEvidence(w);
    expect(w.stages[0].state).toBe('missing');
  });
  it('rejects found stages without explicit review', () => {
    const w = base();
    w.stages[0].state = 'found';
    expect(() => assertPublicationEvidence(w)).toThrow('explicit');
  });
  it('rejects institution payments without official project allocations', () => {
    const w = base();
    w.stages[0] = {
      ...w.stages[0],
      state: 'found',
      reviewStatus: 'verified',
      receipts: [{ id: 'r' } as any],
    };
    w.money = [
      {
        id: 'p',
        measure: 'payment',
        kind: 'transaction',
        amount: '100.00',
        approved: true,
        reviewStatus: 'verified',
        receiptId: 'r',
      } as MoneyEvent,
    ];
    expect(() => assertPublicationEvidence(w)).toThrow('allocation');
  });
  it('accepts a documented allocated payment and rejects a different project', () => {
    const w = base();
    w.stages[0] = {
      ...w.stages[0],
      state: 'found',
      reviewStatus: 'verified',
      receipts: [{ id: 'r' } as any],
    };
    w.money = [
      {
        id: 'p',
        measure: 'payment',
        kind: 'transaction',
        amount: '100.00',
        approved: true,
        reviewStatus: 'verified',
        receiptId: 'r',
        date: '2026-10-01',
        sourcePaymentId: 'official-1',
        allocation: { projectId: 'road-1', amount: '100.00', receiptId: 'r' },
        flow: 'contractor_payment',
        amountBasis: 'net',
        payee: 'Contractor',
      } as MoneyEvent,
    ];
    expect(() => assertPublicationEvidence(w)).not.toThrow();
    w.money[0].date = null;
    expect(() => assertPublicationEvidence(w)).toThrow();
    w.money[0].date = '2026-10-01';
    w.money[0].allocation!.projectId = 'road-2';
    expect(() => assertPublicationEvidence(w)).toThrow();
  });
  it('supports lakh precision without rounding fractional paise', () => {
    expect(normalizeAmount('536.700', 'lakh')).toBe('53670000.00');
    expect(() => normalizeAmount('0.00000001', 'lakh')).toThrow('paise');
  });
  it('excludes government transfers from contractor spending and applies reversals', () => {
    const events = [
      {
        id: 'transfer',
        canonicalId: 'a',
        measure: 'payment',
        kind: 'transaction',
        amount: '100.00',
        date: '2026-01-01',
        approved: true,
        receiptId: 'r',
        flow: 'government_transfer',
      },
      {
        id: 'paid',
        canonicalId: 'b',
        measure: 'payment',
        kind: 'transaction',
        amount: '100.00',
        date: '2026-01-01',
        approved: true,
        receiptId: 'r',
        flow: 'contractor_payment',
      },
      {
        id: 'refund',
        canonicalId: 'c',
        measure: 'payment',
        kind: 'reversal',
        amount: '-10.00',
        date: '2026-01-02',
        approved: true,
        receiptId: 'r',
        flow: 'contractor_payment',
      },
    ] as MoneyEvent[];
    expect(aggregateMoney(events, 'payment').amount).toBe('90.00');
  });
});
