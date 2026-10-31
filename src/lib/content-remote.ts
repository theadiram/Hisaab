import { z } from 'zod';
import { cardPresets, contentPresets, type CardFocus, type PresetId } from './content-mode';

export const remoteSessionSchema = z
  .object({ id: z.string().uuid(), key: z.string().min(40).max(100) })
  .strict();
const presetIds = contentPresets.map(([id]) => id) as [PresetId, ...PresetId[]];
const cardIds = cardPresets.map(([id]) => id) as [CardFocus, ...CardFocus[]];
export const remoteCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('demo') }).strict(),
  z.object({ type: z.literal('preset'), id: z.enum(presetIds) }).strict(),
  z.object({ type: z.literal('card'), focus: z.enum(cardIds) }).strict(),
  z.object({ type: z.literal('visibility'), card: z.enum(['show', 'hide', 'emphasis']) }).strict(),
  z
    .object({
      type: z.literal('showcase'),
      id: z.enum(['country-scale-receipt', 'location-story']),
    })
    .strict(),
  z
    .object({ type: z.literal('playback'), action: z.enum(['pause', 'resume', 'stop', 'replay']) })
    .strict(),
  z
    .object({
      type: z.literal('look'),
      theme: z.enum(['light', 'dark']).optional(),
      basemap: z.enum(['satellite', 'streets']).optional(),
    })
    .strict(),
]);
export type RemoteCommand = z.infer<typeof remoteCommandSchema>;
export type RemoteSession = z.infer<typeof remoteSessionSchema>;
