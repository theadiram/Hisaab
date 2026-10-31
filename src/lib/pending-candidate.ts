import { z } from 'zod';
import { workSchema } from './validation';

/** Inspection only: an original pending candidate can lack a reconciled district.
 * Publication, proposed intake and reconciliation continue to use workSchema. */
export const pendingCandidateSchema = workSchema.safeExtend({ areaId: z.string() });
