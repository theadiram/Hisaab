import { z } from 'zod';

const count = z.number().int().nonnegative();
const text = z.string().min(1).max(1000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const evidence = z.enum(['missing', 'partial', 'verified']);
const unit = z.object({
  id: text,
  name: text,
  workRegister: evidence,
  paymentRegister: evidence,
  reconciliation: z.enum(['pending', 'verified']),
  geography: evidence,
  publication: z.enum(['pending', 'reviewed']),
  nextAction: text,
});
const authority = z.object({
  id: text,
  name: text,
  level: text,
  rosterStatus: z.enum(['pending', 'partial', 'verified']),
  expectedUnits: count.nullable(),
  units: z.array(unit),
  nextAction: text,
  sourceUrl: z
    .url()
    .refine((value) => value.startsWith('https://'), 'Official source must use HTTPS'),
});
const schema = z.object({
  updatedOn: isoDate,
  status: z.literal('incomplete'),
  period: z.object({ closedFinancialYear: text, currentFinancialYear: text, cutoff: isoDate }),
  authorityInventoryComplete: z.literal(false),
  knownAuthorities: count,
  knownUnits: count,
  completeUnits: z.literal(0),
  completePaymentCards: z.literal(0),
  authorities: z.array(authority),
});

/** Current acquisition inventory, never a substitute for a reconciled work register. */
export function delhiCoverage(input: unknown) {
  const data = schema.parse(input);
  const units = data.authorities.flatMap((a) => a.units);
  if (data.knownAuthorities !== data.authorities.length || data.knownUnits !== units.length)
    throw new Error('Delhi inventory counts are inconsistent');
  if (
    new Set(data.authorities.map((a) => a.id)).size !== data.authorities.length ||
    new Set(units.map((u) => u.id)).size !== units.length
  )
    throw new Error('Delhi inventory identities are duplicated');
  for (const a of data.authorities) {
    if (a.expectedUnits !== null && a.expectedUnits < a.units.length)
      throw new Error('Known units exceed the stated roster');
    if (
      a.rosterStatus === 'verified' &&
      (a.expectedUnits === null || a.expectedUnits !== a.units.length)
    )
      throw new Error('Verified roster needs a complete denominator');
    // This version has no signed register/control-total or payment approval inputs.
    if (a.units.some((u) => u.publication === 'reviewed'))
      throw new Error('Publication needs the evidence review catalogue');
  }
  return data;
}
export type DelhiCoverage = ReturnType<typeof delhiCoverage>;
