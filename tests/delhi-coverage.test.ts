import { describe, expect, it } from 'vitest';
import { delhiCoverage } from '../src/lib/delhi-coverage';

function fixture() {
  return {
    updatedOn: '2026-10-09',
    status: 'incomplete',
    period: {
      closedFinancialYear: '2025–26',
      currentFinancialYear: '2026–27',
      cutoff: '2026-10-09',
    },
    authorityInventoryComplete: false,
    knownAuthorities: 1,
    knownUnits: 1,
    completeUnits: 0,
    completePaymentCards: 0,
    authorities: [
      {
        id: 'pwd',
        name: 'Delhi PWD',
        level: 'GNCTD',
        rosterStatus: 'partial',
        expectedUnits: null,
        sourceUrl: 'https://www.pwddelhi.gov.in/office-user-directory',
        nextAction: 'Obtain complete roster',
        units: [
          {
            id: 'pwd-ser2',
            name: 'South East Road Division 2',
            workRegister: 'partial',
            paymentRegister: 'missing',
            reconciliation: 'pending',
            geography: 'missing',
            publication: 'pending',
            nextAction: 'Obtain bill register',
          },
        ],
      },
    ],
  };
}
describe('Delhi acquisition coverage', () => {
  it('keeps the unknown denominator unknown and has no coverage percentage', () => {
    const result = delhiCoverage(fixture());
    expect(result.authorities[0].expectedUnits).toBeNull();
    expect(result.completePaymentCards).toBe(0);
    expect(result).not.toHaveProperty('coveragePercent');
  });
  it('rejects full Delhi and payment-complete claims without the review catalogue', () => {
    expect(() => delhiCoverage({ ...fixture(), authorityInventoryComplete: true })).toThrow();
    expect(() => delhiCoverage({ ...fixture(), completePaymentCards: 1 })).toThrow();
    expect(() => delhiCoverage({ ...fixture(), status: 'complete' })).toThrow();
    const input = fixture();
    input.authorities[0].units[0].publication = 'reviewed';
    expect(() => delhiCoverage(input)).toThrow('Publication needs');
  });
  it('rejects guessed denominators and mismatched counts', () => {
    const input = fixture();
    input.authorities[0].rosterStatus = 'verified';
    expect(() => delhiCoverage(input)).toThrow('complete denominator');
    expect(() => delhiCoverage({ ...fixture(), knownAuthorities: 2 })).toThrow('inconsistent');
    expect(() => delhiCoverage({ ...fixture(), knownUnits: 0 })).toThrow('inconsistent');
  });
  it('rejects duplicate units across authorities and undersized rosters', () => {
    const input = fixture();
    input.authorities.push({ ...input.authorities[0], id: 'other' });
    input.knownAuthorities = 2;
    input.knownUnits = 2;
    expect(() => delhiCoverage(input)).toThrow('duplicated');
    const small = fixture();
    expect(() =>
      delhiCoverage({
        ...small,
        authorities: small.authorities.map((a) => ({ ...a, expectedUnits: 0 })),
      }),
    ).toThrow('exceed');
  });
  it('projects only public workflow fields and excludes private source contents', () => {
    const input = fixture();
    Object.assign(input.authorities[0].units[0], {
      payee: 'Private name',
      bankAccount: '001',
      rawOriginal: '/private/file',
      money: 100,
    });
    const result = delhiCoverage(input);
    expect(JSON.stringify(result)).not.toContain('Private name');
    expect(result.authorities[0].units[0]).not.toHaveProperty('money');
  });
});
