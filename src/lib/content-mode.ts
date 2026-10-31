import { z } from 'zod';
import type { Exploration } from './exploration';
import { fundingYears, fundingStates, fundingPurposes } from './funding';
import { completeCardDemo } from './complete-card-demo';
export const cameraSchema = z
  .object({
    center: z.tuple([z.number().min(35).max(125), z.number().min(-25).max(60)]),
    zoom: z.number().min(0).max(19),
    pitch: z.number().min(0).max(55),
    bearing: z.number().min(-1080).max(1080),
    padding: z.object({
      top: z.number().min(0).max(3000),
      bottom: z.number().min(0).max(3000),
      left: z.number().min(0).max(3000),
      right: z.number().min(0).max(3000),
    }),
    width: z.number().positive().max(20000),
    height: z.number().positive().max(20000),
  })
  .strict();
export type CameraPose = z.infer<typeof cameraSchema>;
export const cardPresets = [
  ['overview', 'Full receipt', 'Photo, identity and the complete receipt.'],
  ['hero', 'Location portrait', 'Lead with the photograph or attributed map context.'],
  ['money', 'Money close-up', 'Sanction, contract and payment figures remain distinct.'],
  ['timeline', 'Funding timeline', 'The documented sanction-to-completion stages.'],
  ['payments', 'Payment detail', 'Available dated payments, recipients and source references.'],
  ['people', 'Responsible roles', 'Documented organisations and people, where available.'],
  ['evidence', 'Evidence check', 'What is linked and what is still missing.'],
  ['source', 'Source proof', 'The original location identity and source details.'],
  ['report', 'Report action', 'Frame the source and report controls without submitting anything.'],
] as const;
export type CardFocus = (typeof cardPresets)[number][0];
export const presentationSchema = z
  .object({
    frame: z.enum(['screen', 'wide', 'portrait', 'square']),
    clean: z.boolean(),
    card: z.enum(['show', 'hide', 'emphasis']),
    count: z.boolean(),
    cardFocus: z
      .enum([
        'overview',
        'hero',
        'money',
        'timeline',
        'payments',
        'people',
        'evidence',
        'source',
        'report',
      ])
      .default('overview'),
  })
  .strict();
export type ContentPresentation = z.infer<typeof presentationSchema>;
export const defaultPresentation: ContentPresentation = {
  frame: 'screen',
  clean: false,
  card: 'show',
  count: false,
  cardFocus: 'overview',
};
const viewSchema = z
  .object({
    screen: z.enum(['india', 'state', 'asset']),
    state: z
      .string()
      .nullable()
      .refine((s) => s === null || fundingStates.some((f) => f.code === s)),
    asset: z.string().min(1).max(200).nullable(),
    work: z.string().min(1).max(200).nullable(),
    year: z.string().refine((y) => fundingYears.includes(y)),
    measure: z.enum(['allocated', 'released', 'reported_spent']),
    purpose: z.string().refine((p) => p === 'all' || Object.hasOwn(fundingPurposes, p)),
    exploring: z.boolean(),
  })
  .strict()
  .refine(
    (v) => v.screen !== 'asset' || !!(v.asset || v.work),
    'An asset shot requires its original identifier',
  );
export const shotSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    pose: cameraSchema,
    duration: z.number().min(0.5).max(60),
    hold: z.number().min(0).max(30),
    presentation: presentationSchema,
    view: viewSchema,
    theme: z.enum(['light', 'dark']),
    basemap: z.enum(['satellite', 'streets']).default('satellite'),
    layers: z
      .object({ historical: z.boolean(), projects: z.boolean(), funding: z.boolean() })
      .strict(),
  })
  .strict();
export type SavedShot = z.infer<typeof shotSchema>;
const projectSchema = z
  .object({ version: z.literal(1), shots: z.array(shotSchema).max(60) })
  .strict()
  .refine(
    (p) => new Set(p.shots.map((s) => s.id)).size === p.shots.length,
    'Shot identities must be unique',
  );
export function readShotProject(text: string): SavedShot[] {
  if (text.length > 250000) throw new Error('Shot file is too large.');
  return projectSchema.parse(JSON.parse(text)).shots;
}
export function writeShotProject(shots: SavedShot[]) {
  return JSON.stringify(projectSchema.parse({ version: 1, shots }), null, 2);
}
export function scalePadding(pose: CameraPose, width: number, height: number) {
  const p = {
    top: (pose.padding.top * height) / pose.height,
    bottom: (pose.padding.bottom * height) / pose.height,
    left: (pose.padding.left * width) / pose.width,
    right: (pose.padding.right * width) / pose.width,
  };
  const x = Math.min(1, (width * 0.8) / Math.max(1, p.left + p.right)),
    y = Math.min(1, (height * 0.8) / Math.max(1, p.top + p.bottom));
  return { left: p.left * x, right: p.right * x, top: p.top * y, bottom: p.bottom * y };
}
export const contentPresets = [
  ['india-reveal', 'India reveal', 'Country', 'A gentle approach to the full country.'],
  ['india-rise', 'India pullback', 'Country', 'Rise back to the country overview.'],
  ['north-south', 'North → south', 'Country', 'Travel down the country.'],
  ['south-north', 'South → north', 'Country', 'Travel towards the Himalayas.'],
  ['east-west', 'East → west', 'Country', 'A wide cross-country sweep.'],
  ['himalayas', 'Himalayan sweep', 'Region', 'A tilted mountain-range pass.'],
  ['ganges', 'Ganges corridor', 'Region', 'Travel across the northern plains.'],
  ['west-coast', 'Western coastline', 'Region', 'A slow coast-to-coast movement south.'],
  ['east-coast', 'Eastern coastline', 'Region', 'Follow the eastern coast.'],
  ['northeast', 'Northeast reveal', 'Region', 'Approach the northeastern region.'],
  ['deccan', 'Deccan plateau', 'Region', 'A low-angle regional pass.'],
  ['islands', 'Island approach', 'Region', 'Approach Andaman and Nicobar.'],
  ['push', 'Gentle push-in', 'Current view', 'A subtle approach from this camera.'],
  ['pull', 'Gentle pull-out', 'Current view', 'Open the frame around this camera.'],
  ['pan-left', 'Lateral drift', 'Current view', 'A slow horizontal movement.'],
  ['top-down', 'Top-down reveal', 'Selected asset', 'Look straight down at the recorded location.'],
  ['fly', 'Fly to selection', 'Selected asset', 'Approach the selected coordinate.'],
  ['orbit', 'Full orbit', 'Selected asset', 'A full orbit in four camera arcs.'],
  ['arc', 'Gentle orbit', 'Selected asset', 'A restrained 70-degree arc.'],
  ['rise', 'Site to region', 'Selected asset', 'Rise away from the recorded location.'],
  ['receipt', 'Receipt reveal', 'Selected asset', 'Settle on the site, then reveal its card.'],
  ['hold', 'Hold for narration', 'Current view', 'Keep the camera still.'],
  [
    'demo-card',
    'Lalbagh cinematic tour',
    'Demo',
    'A slow Lalbagh approach, automatic card reveal, multiple angles and a full detail scroll. Real place; fictional project and recipient.',
  ],
] as const;
export type PresetId = (typeof contentPresets)[number][0];
export type RunStep = {
  name: string;
  target?: CameraPose;
  from?: CameraPose;
  duration: number;
  hold: number;
  settleSeconds?: number;
  card?: ContentPresentation['card'];
  cardFocus?: CardFocus;
  demo?: boolean;
  cardScroll?: boolean;
  shot?: SavedShot;
};
export type CameraSpeed = 'slow' | 'normal' | 'fast';
export const cameraSpeedScale: Record<CameraSpeed, number> = { slow: 2.25, normal: 1, fast: 0.65 };
export function cameraMoveSeconds(seconds: number, speed: CameraSpeed) {
  return Math.min(60, Math.max(0, seconds * cameraSpeedScale[speed]));
}
export function needsSelection(id: PresetId) {
  return contentPresets.find((p) => p[0] === id)?.[2] === 'Selected asset';
}
export function presetSteps(
  id: PresetId,
  current: CameraPose,
  india: CameraPose,
  location: [number, number] | null,
  duration: number,
): RunStep[] {
  if (id === 'demo-card') {
    const focus: CameraPose = {
      ...current,
      center: completeCardDemo.location!,
      zoom: 16.5,
      pitch: 50,
      bearing: -15,
      padding:
        current.width > 760
          ? { top: 75, bottom: 60, left: 55, right: Math.min(500, current.width * 0.42) }
          : {
              top: 170,
              bottom: Math.min(current.height * 0.52 + 60, current.height * 0.65),
              left: 28,
              right: 28,
            },
    };
    const site: CameraPose = { ...focus, padding: { top: 65, bottom: 60, left: 55, right: 55 } };
    return [
      {
        name: 'Demo point approach',
        demo: true,
        target: { ...site, zoom: 15.6, pitch: 35 },
        duration,
        hold: 5,
        card: 'hide',
        cardFocus: 'overview',
      },
      {
        name: 'Open project card',
        target: focus,
        duration: 0,
        hold: 5,
        card: 'show',
        cardFocus: 'overview',
      },
      {
        name: 'Read the complete card',
        target: focus,
        duration: 30,
        hold: 5,
        card: 'emphasis',
        cardFocus: 'overview',
        cardScroll: true,
      },
      {
        name: 'Glasshouse overhead',
        target: { ...focus, zoom: 17.1, pitch: 0, bearing: 0 },
        duration,
        hold: 5,
        card: 'show',
      },
      {
        name: 'Garden eastward arc',
        target: { ...focus, bearing: 75 },
        duration,
        hold: 5,
        card: 'show',
      },
      {
        name: 'Garden southern angle',
        target: { ...focus, bearing: 165, pitch: 45 },
        duration,
        hold: 5,
        card: 'show',
      },
      {
        name: 'Garden westward arc',
        target: { ...focus, bearing: 255 },
        duration,
        hold: 5,
        card: 'show',
      },
      {
        name: 'Garden aerial pullback',
        target: { ...focus, zoom: 14.8, pitch: 25, bearing: 345 },
        duration,
        hold: 5,
        card: 'show',
      },
      {
        name: 'Demo receipt reveal',
        target: { ...focus, bearing: 345 },
        duration,
        hold: 8,
        card: 'show',
        cardFocus: 'overview',
      },
    ];
  }
  if (needsSelection(id) && !location)
    throw new Error('Select an asset or project on the map first.');
  const pose = (center: [number, number], zoom: number, pitch = 35, bearing = 0): CameraPose => ({
    ...current,
    center,
    zoom: Math.min(19, Math.max(3, zoom)),
    pitch,
    bearing,
  });
  const step = (target: CameraPose, from?: CameraPose): RunStep[] => [
    { name: contentPresets.find((p) => p[0] === id)![1], target, from, duration, hold: 1 },
  ];
  if (id === 'india-reveal')
    return step(
      { ...india, zoom: india.zoom + 0.25 },
      { ...india, zoom: Math.max(0, india.zoom - 0.25) },
    );
  if (id === 'india-rise') return step(india);
  if (id === 'north-south') return step(pose([78, 10], 5.2, 40), pose([78, 33], 5.2, 40));
  if (id === 'south-north') return step(pose([78, 33], 5.2, 40), pose([78, 10], 5.2, 40));
  if (id === 'east-west') return step(pose([71, 23], 5.5, 35), pose([94, 25], 5.5, 35));
  if (id === 'himalayas') return step(pose([91, 28], 6.3, 55, 20), pose([75, 34], 6.3, 55, 20));
  if (id === 'ganges') return step(pose([87, 25], 7, 40), pose([78, 28], 7, 40));
  if (id === 'west-coast')
    return step(pose([76.5, 9], 6.5, 45, -15), pose([72.5, 22], 6.5, 45, -15));
  if (id === 'east-coast') return step(pose([80.5, 12], 6.5, 40), pose([86, 20], 6.5, 40));
  if (id === 'northeast') return step(pose([93, 26], 6.6, 35), pose([90.5, 26], 5, 0));
  if (id === 'deccan') return step(pose([78, 15], 6.5, 50, 15), pose([77, 21], 6.5, 50, 15));
  if (id === 'islands') return step(pose([92.8, 12], 8, 40), pose([91, 13], 6, 15));
  if (id === 'push') return step({ ...current, zoom: Math.min(19, current.zoom + 0.7) });
  if (id === 'pull') return step({ ...current, zoom: Math.max(0, current.zoom - 0.7) });
  if (id === 'pan-left')
    return step({
      ...current,
      center: [
        Math.max(67, current.center[0] - 0.015 * 2 ** (14 - current.zoom)),
        current.center[1],
      ],
    });
  if (id === 'hold') return [{ name: 'Hold for narration', duration: 0, hold: duration }];
  const focus = pose(location!, 16.5, 50, current.bearing);
  if (id === 'top-down') return step({ ...focus, pitch: 0, bearing: 0 });
  if (id === 'fly') return step(focus);
  if (id === 'rise') return step({ ...focus, zoom: 9, pitch: 15 }, focus);
  if (id === 'arc') return step({ ...focus, bearing: current.bearing + 70 }, focus);
  if (id === 'orbit')
    return Array.from({ length: 4 }, (_, i) => ({
      name: `Orbit ${i + 1}/4`,
      from: i === 0 ? focus : undefined,
      target: { ...focus, bearing: current.bearing + (i + 1) * 90 },
      duration: duration / 4,
      hold: i === 3 ? 1 : 0,
    }));
  return [
    { name: 'Approach location', target: focus, duration: duration * 0.7, hold: 0.3, card: 'hide' },
    { name: 'Reveal receipt', target: focus, duration: duration * 0.3, hold: 3, card: 'show' },
  ];
}
export type RestoreContext = {
  view: Exploration;
  theme: 'light' | 'dark';
  layers: SavedShot['layers'];
  basemap?: 'satellite' | 'streets';
};

export function allPresetSequence(
  current: CameraPose,
  india: CameraPose,
  location: [number, number] | null,
  duration: number,
): RunStep[] {
  const plan: RunStep[] = [];
  let previous = current;
  for (const [id] of contentPresets) {
    if (needsSelection(id) && !location) continue;
    const steps = presetSteps(id, previous, india, location, duration);
    steps[0] = { ...steps[0], from: steps[0].from ?? previous, settleSeconds: plan.length ? 5 : 0 };
    if (id !== 'hold' && id !== 'demo-card')
      steps[steps.length - 1] = { ...steps[steps.length - 1], hold: 0 };
    plan.push(...steps);
    previous = steps.at(-1)?.target ?? previous;
  }
  return plan;
}
