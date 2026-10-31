import { z } from 'zod';
import Decimal from 'decimal.js';
import { workSchema } from './validation';
import { developmentSchema } from './development';
import { normalizeAmount } from './money';
import { fundingStates, fundingYears } from './funding';
const id = z.string().min(1).max(240),
  amount = z.string().regex(/^-?\d{1,18}\.\d{2}$/),
  date = z.iso.date().nullable();
export const evidenceRef = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    url: z.url().refine((v) => v.startsWith('https://')),
    locator: z.string().min(1).max(1200),
  })
  .strict();
const base = z.object({ id, sourceRefs: z.array(evidenceRef).min(1).max(10) });
export const intakeContract = z
  .object({
    version: z.literal('hisaab-intake/1'),
    batchId: id,
    jurisdiction: z
      .string()
      .refine((v) => v === 'national' || fundingStates.some((s) => s.code === v)),
    cutoff: z.iso.date(),
    sources: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(240),
            family: z.string().min(1).max(100),
            hash: z.string().regex(/^[a-f0-9]{64}$/),
            url: z.url().refine((v) => v.startsWith('https://')),
            storagePath: z.string().regex(/^[a-zA-Z0-9_-]+\/[a-f0-9]{64}$/),
            contentType: z.string().min(1).max(100),
            retrievedAt: z.iso.datetime({ offset: true }),
            reuseBasis: z.string().min(1).max(1200),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    projects: z.array(workSchema).max(100).default([]),
    funding: z.array(developmentSchema).max(100).default([]),
    assets: z
      .array(
        base.extend({
          projectId: id,
          assetId: id,
          matchBasis: z.enum(['official_id', 'documented_crosswalk']),
          location: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
          precision: z.enum(['source_point', 'address']),
          geometry: z.record(z.string(), z.unknown()).nullable(),
        }),
      )
      .max(100)
      .default([]),
    contracts: z
      .array(
        base.extend({
          projectId: id,
          contractId: id,
          contractorId: id.nullable(),
          amountRupees: amount.nullable(),
          date,
          startDate: date,
          endDate: date,
        }),
      )
      .max(100)
      .default([]),
    payments: z
      .array(
        base.extend({
          sourcePaymentId: id,
          billId: id,
          recipientId: id.nullable(),
          recipientRole: z.enum(['contractor', 'supplier', 'agency', 'employee', 'unknown']),
          flow: z.enum([
            'contractor_payment',
            'government_transfer',
            'deduction',
            'advance',
            'unclassified',
          ]),
          originalAmount: z.string().max(100),
          originalUnit: z.enum(['rupees', 'lakh', 'crore']),
          amountRupees: amount,
          amountBasis: z.enum(['gross', 'net', 'unknown']),
          grossRupees: amount.nullable(),
          deductionsRupees: amount.nullable(),
          netRupees: amount.nullable(),
          date,
          dateBasis: z.enum([
            'initiation',
            'treasury',
            'cheque',
            'recipient_credit',
            'recipient_return',
            'unknown',
          ]),
          status: z.enum([
            'reported_paid',
            'credited',
            'pending',
            'failed',
            'returned',
            'reversed',
            'unknown',
          ]),
          reversalOf: id.nullable(),
          reissueOf: id.nullable(),
        }),
      )
      .max(200)
      .default([]),
    allocations: z
      .array(
        base.extend({
          paymentId: id,
          projectId: id,
          amountRupees: amount,
          amountBasis: z.enum(['gross', 'net']),
          allocationReference: id,
        }),
      )
      .max(200)
      .default([]),
    parties: z
      .array(
        base.extend({
          name: z.string().min(1).max(300),
          role: z.string().min(1).max(200),
          organisation: z.string().max(300).nullable(),
          projectId: id,
          photoUrl: z.url().nullable(),
          photoSource: z.url().nullable(),
        }),
      )
      .max(100)
      .default([]),
    completion: z
      .array(
        base.extend({
          projectId: id,
          basis: z.enum(['reported', 'certificate']),
          date,
          certificateId: id.nullable(),
          description: z.string().max(3000),
        }),
      )
      .max(100)
      .default([]),
    coverage: z
      .object({
        denominator: z.number().int().nonnegative().nullable(),
        denominatorSource: evidenceRef.nullable(),
        years: z
          .array(z.enum(fundingYears as [string, ...string[]]))
          .min(1)
          .max(11),
        missing: z.array(z.string().max(1200)).max(100),
        nextAction: z.string().max(2000),
        checkpoint: z.string().max(2000),
      })
      .strict(),
  })
  .strict();
export type IntakePackage = z.infer<typeof intakeContract>;
export function validateIntake(input: unknown) {
  const p = intakeContract.parse(input),
    sources = new Map(p.sources.map((s) => [s.hash, s])),
    projects = new Set(p.projects.map((w) => w.id)),
    payments = new Map(p.payments.map((r) => [r.id, r]));
  if (
    sources.size !== p.sources.length ||
    new Set(p.sources.map((s) => s.id)).size !== p.sources.length
  )
    throw new Error('Duplicate source identity');
  for (const source of p.sources)
    if (source.storagePath !== source.id + '/' + source.hash)
      throw new Error('Original path must match its source identity and checksum');
  const seen = new Set<string>();
  let count = 0;
  const evidence = (refs: z.infer<typeof evidenceRef>[]) => {
    for (const ref of refs)
      if (sources.get(ref.hash)?.url !== ref.url)
        throw new Error('Evidence must refer to a preserved source with its exact URL');
  };
  for (const key of [
    'projects',
    'funding',
    'assets',
    'contracts',
    'payments',
    'allocations',
    'parties',
    'completion',
  ] as const)
    for (const r of p[key]) {
      const identity = key + ':' + r.id;
      if (seen.has(identity)) throw new Error('Repeated record identity');
      seen.add(identity);
      count++;
    }
  if (count > 500) throw new Error('A batch is bounded to 500 records');
  for (const w of p.projects) {
    if (
      w.demo ||
      w.money.some((e) => e.approved || e.reviewStatus === 'verified') ||
      w.stages.some((s) => s.reviewStatus === 'verified')
    )
      throw new Error('Agents cannot approve evidence');
    evidence(
      w.stages
        .flatMap((s) => s.receipts)
        .map((r) => ({ hash: r.documentHash, url: r.url, locator: r.locator })),
    );
    for (const r of [
      ...(w.roles ?? []).map((role) => role.receipt),
      ...(w.media ?? []).map((m) => m.receipt),
      ...(w.authorityReceipt ? [w.authorityReceipt] : []),
    ])
      evidence([{ hash: r.documentHash, url: r.url, locator: r.locator }]);
  }
  if (p.coverage.denominatorSource) evidence([p.coverage.denominatorSource]);
  if (p.coverage.denominator !== null && !p.coverage.denominatorSource)
    throw new Error('Coverage denominator needs official evidence');
  for (const r of p.funding) {
    evidence([r.source]);
    if (p.jurisdiction !== 'national' && r.jurisdiction !== p.jurisdiction)
      throw new Error('Funding jurisdiction disagrees with the batch');
  }
  for (const w of p.projects) {
    if (
      !fundingYears.includes(w.financialYear) ||
      (p.jurisdiction !== 'national' &&
        fundingStates.find((s) => s.code === p.jurisdiction)?.name !== w.state)
    )
      throw new Error('Project jurisdiction or financial year disagrees with the batch');
  }
  for (const key of [
    'assets',
    'contracts',
    'payments',
    'allocations',
    'parties',
    'completion',
  ] as const)
    for (const r of p[key]) {
      evidence(r.sourceRefs);
      if ('projectId' in r && !projects.has(r.projectId))
        throw new Error('Project links require an exact project in the batch');
    }
  const paymentIdentities = new Set<string>();
  for (const r of p.payments) {
    if (paymentIdentities.has(r.sourcePaymentId))
      throw new Error('Repeated official payment identity');
    paymentIdentities.add(r.sourcePaymentId);
    if (r.reversalOf === r.id || r.reissueOf === r.id)
      throw new Error('Self-referencing payment history');
    if (r.status === 'reversed' && !new Decimal(r.amountRupees).isNegative())
      throw new Error('Reversals require a documented negative adjustment');
    if (normalizeAmount(r.originalAmount, r.originalUnit) !== r.amountRupees)
      throw new Error('Source units do not match the exact normalized amount');
    if (r.date === null && r.dateBasis !== 'unknown')
      throw new Error('A missing date must remain unknown');
    if (
      r.grossRupees !== null &&
      r.deductionsRupees !== null &&
      r.netRupees !== null &&
      !new Decimal(r.grossRupees).minus(r.deductionsRupees).eq(r.netRupees)
    )
      throw new Error('Gross, deductions and net do not reconcile');
    if (
      (r.reversalOf && !payments.has(r.reversalOf)) ||
      (r.reissueOf && !payments.has(r.reissueOf))
    )
      throw new Error('Payment history reference is absent');
  }
  for (const r of p.payments) {
    const visited = new Set<string>([r.id]);
    let previous = r.reversalOf ?? r.reissueOf;
    while (previous) {
      if (visited.has(previous)) throw new Error('Cyclic payment history');
      visited.add(previous);
      const parent = payments.get(previous);
      previous = parent?.reversalOf ?? parent?.reissueOf ?? null;
    }
  }
  const allocationIdentities = new Set<string>();
  const totals = new Map<string, Decimal>();
  for (const a of p.allocations) {
    const identity = [a.paymentId, a.projectId, a.allocationReference, a.amountBasis].join('|');
    if (allocationIdentities.has(identity))
      throw new Error('Duplicate official project allocation');
    allocationIdentities.add(identity);
    const payment = payments.get(a.paymentId);
    if (!payment) throw new Error('Allocation payment is absent');
    const key = a.paymentId + '|' + a.amountBasis;
    totals.set(key, (totals.get(key) ?? new Decimal(0)).plus(a.amountRupees));
    const maximum = a.amountBasis === 'gross' ? payment.grossRupees : payment.netRupees;
    if (maximum === null) throw new Error('Allocation basis must be documented');
    if (totals.get(key)!.abs().gt(new Decimal(maximum).abs()))
      throw new Error('Project shares exceed the documented payment basis');
    if (
      new Decimal(a.amountRupees).isNegative() !== new Decimal(maximum).isNegative() &&
      !new Decimal(a.amountRupees).isZero()
    )
      throw new Error('Allocation sign disagrees with payment');
  }
  return {
    package: p,
    summary: {
      projects: p.projects.length,
      funding: p.funding.length,
      payments: p.payments.length,
      assets: p.assets.length,
      totalRecords: count,
      publication: 'private_pending_review',
    },
  };
}
