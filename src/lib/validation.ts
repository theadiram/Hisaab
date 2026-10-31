import { z } from 'zod';
import { normalizeAmount } from './money';
const amount = z
  .string()
  .max(26)
  .regex(/^-?\d+\.\d{2}$/);
export const receiptSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  url: z.url().refine((v) => v.startsWith('https://')),
  documentHash: z.string().regex(/^[a-f0-9]{64}$/),
  locator: z.string().min(1),
  retrievedAt: z.string().min(10),
  rawText: z.string().min(1),
  permission: z.string().min(1),
});
export const workSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1).max(1000),
    purpose: z.string(),
    state: z.string().min(1),
    district: z.string().min(1),
    areaId: z.string().min(1),
    financialYear: z.string(),
    officialIds: z.array(z.string().min(1)).min(1),
    location: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]).nullable(),
    locationPrecision: z.enum(['source_point', 'address', 'district', 'unknown']),
    authority: z.string().nullable(),
    authorityReceipt: receiptSchema.nullable(),
    physicalVerification: z.string(),
    summary: z.string(),
    assetId: z.string().max(240).optional(),
    roles: z
      .array(
        z.object({
          id: z.string().min(1),
          name: z.string().min(1),
          role: z.string().min(1),
          organisation: z.string().nullable(),
          receipt: receiptSchema,
          photoUrl: z
            .url()
            .refine((v) => v.startsWith('https://'))
            .nullable(),
          photoSource: z
            .url()
            .refine((v) => v.startsWith('https://'))
            .nullable(),
          identityBasis: z.enum(['official_id', 'documented_crosswalk']).optional(),
        }),
      )
      .max(30)
      .optional(),
    media: z
      .array(
        z.object({
          id: z.string().min(1),
          url: z.url().refine((v) => v.startsWith('https://')),
          caption: z.string(),
          date: z.iso.date().nullable(),
          receipt: receiptSchema,
          kind: z.enum(['photo', 'footprint']),
        }),
      )
      .max(30)
      .optional(),
    demo: z.literal(false).optional(),
    stages: z.array(
      z.object({
        id: z.enum(['sanction', 'award', 'payment', 'completion']),
        label: z.string(),
        state: z.enum([
          'found',
          'missing',
          'conflicting',
          'inaccessible',
          'not_applicable',
          'pending',
        ]),
        date: z.iso.date().nullable(),
        amount: amount.nullable(),
        description: z.string(),
        reviewStatus: z.enum(['pending', 'verified', 'conflicting']).optional(),
        completionBasis: z.enum(['reported', 'certificate']).optional(),
        receipts: z.array(receiptSchema),
      }),
    ),
    money: z.array(
      z.object({
        id: z.string(),
        measure: z.enum(['sanction', 'contract', 'payment']),
        amount,
        kind: z.enum(['transaction', 'cumulative', 'reversal']),
        canonicalId: z.string().min(1),
        date: z.iso.date().nullable(),
        receiptId: z.string().min(1),
        originalAmount: z.string().min(1).max(100),
        originalUnit: z.enum(['rupees', 'lakh', 'crore']),
        approved: z.boolean(),
        reviewStatus: z.enum(['pending', 'verified', 'conflicting']).optional(),
        sourcePaymentId: z.string().min(1).optional(),
        amountBasis: z.enum(['gross', 'net', 'unknown']).optional(),
        reportingCutoff: z.iso.date().optional(),
        flow: z.enum(['contractor_payment', 'government_transfer', 'unclassified']).optional(),
        payee: z.string().min(1).optional(),
        allocation: z
          .object({ projectId: z.string().min(1), amount, receiptId: z.string().min(1) })
          .optional(),
      }),
    ),
  })
  .superRefine((w, ctx) => {
    if (w.stages.length !== 4 || new Set(w.stages.map((s) => s.id)).size !== 4)
      ctx.addIssue({
        code: 'custom',
        message: 'All four financial and completion stages must be represented',
      });
    const receipts = new Set(w.stages.flatMap((s) => s.receipts.map((r) => r.id)));
    if (w.location && !['source_point', 'address'].includes(w.locationPrecision))
      ctx.addIssue({ code: 'custom', message: 'A precise map pin needs location evidence' });
    for (const s of w.stages)
      if (s.state === 'found' && !s.receipts.length)
        ctx.addIssue({ code: 'custom', message: 'Found stage lacks evidence' });
    for (const e of w.money) {
      try {
        if (normalizeAmount(e.originalAmount, e.originalUnit) !== e.amount)
          ctx.addIssue({
            code: 'custom',
            message: 'Normalized money does not match its original amount and unit',
          });
      } catch {
        ctx.addIssue({
          code: 'custom',
          message: 'Original amount could not be normalized exactly',
        });
      }
      if (!receipts.has(e.receiptId))
        ctx.addIssue({ code: 'custom', message: 'Money event lacks a linked receipt' });
      if (e.kind === 'reversal' && !e.amount.startsWith('-'))
        ctx.addIssue({ code: 'custom', message: 'Reversal must be negative' });
    }
  });
