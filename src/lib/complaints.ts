import { z } from 'zod';
import { fundingStates } from './funding';
export const routeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,100}$/),
    name: z.string().min(3).max(200),
    jurisdiction: z
      .string()
      .refine((v) => v === 'national' || fundingStates.some((s) => s.code === v)),
    authority: z.string().min(3).max(300),
    channel: z.enum(['portal', 'email', 'postal']),
    destination: z.string().max(500),
    policyUrl: z.url().refine((v) => v.startsWith('https://')),
    policyNote: z.string().min(30).max(2000),
    expiresAt: z.iso.date(),
  })
  .strict()
  .superRefine((r, c) => {
    if (
      r.channel === 'email' &&
      (!z.email().safeParse(r.destination).success ||
        r.id === 'cpgrams' ||
        r.destination.endsWith('@pgportal.gov.in'))
    )
      c.addIssue({ code: 'custom', message: 'This destination does not accept email filing' });
    if (
      r.channel === 'portal' &&
      (!z.url().safeParse(r.destination).success || !r.destination.startsWith('https://'))
    )
      c.addIssue({ code: 'custom', message: 'An HTTPS official portal is required' });
  });
export const complaintSchema = z
  .object({
    routeId: z.string().max(100),
    draft: z.string().min(30).max(10000),
    replyTo: z.email().nullable(),
    consent: z.literal(true),
    delegationConsent: z.boolean(),
  })
  .strict();
export type ComplaintRoute = {
  id: string;
  name: string;
  channel: 'portal' | 'email' | 'postal';
  destination: string;
  policy_note: string;
  policy_url: string;
  authority: string;
  jurisdiction: string;
  expires_at: string;
};
export type ComplaintPacket = z.infer<typeof complaintSchema> & {
  route: ComplaintRoute;
  reference: string;
  preparedAt: string;
  workId: string | null;
};
