import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  readShotProject,
  writeShotProject,
  presetSteps,
  contentPresets,
  defaultPresentation,
  scalePadding,
  cameraMoveSeconds,
  allPresetSequence,
  type CameraPose,
  type SavedShot,
} from '../src/lib/content-mode';
import { initialExploration } from '../src/lib/exploration';
import { ContentPlayer, abortableDelay, type PlayerState } from '../src/lib/content-player';
const pose: CameraPose = {
  center: [79, 23],
  zoom: 5,
  pitch: 30,
  bearing: 0,
  padding: { top: 40, bottom: 50, left: 80, right: 500 },
  width: 1440,
  height: 1000,
};
const shot: SavedShot = {
  id: 'test-shot',
  name: 'A source location',
  pose,
  duration: 2,
  hold: 1,
  presentation: defaultPresentation,
  view: initialExploration,
  theme: 'dark',
  basemap: 'satellite',
  layers: { historical: true, projects: true, funding: false },
};
afterEach(() => vi.useRealTimers());
describe('saved camera projects', () => {
  it('roundtrips the original selection, camera and presentation without financial fields', () => {
    expect(readShotProject(writeShotProject([shot]))).toEqual([shot]);
  });
  it('preserves card framing and accepts earlier shot files without card focus', () => {
    const focused = {
      ...shot,
      presentation: { ...defaultPresentation, cardFocus: 'payments' as const },
    };
    expect(readShotProject(writeShotProject([focused]))[0].presentation.cardFocus).toBe('payments');
    const old = JSON.parse(writeShotProject([shot]));
    delete old.shots[0].presentation.cardFocus;
    expect(readShotProject(JSON.stringify(old))[0].presentation.cardFocus).toBe('overview');
    expect(() =>
      readShotProject(
        JSON.stringify({
          version: 1,
          shots: [{ ...shot, presentation: { ...defaultPresentation, cardFocus: 'invented' } }],
        }),
      ),
    ).toThrow();
  });
  it('rejects unsupported files, arbitrary money data and invalid record/year references', () => {
    expect(() => readShotProject(JSON.stringify({ version: 2, shots: [] }))).toThrow();
    expect(() => writeShotProject([{ ...shot, paid: '999' } as SavedShot])).toThrow();
    expect(() =>
      writeShotProject([{ ...shot, view: { ...initialExploration, year: '2010-2011' } }]),
    ).toThrow();
    expect(() =>
      writeShotProject([
        { ...shot, view: { ...initialExploration, screen: 'asset', asset: null, work: null } },
      ]),
    ).toThrow();
    expect(() => writeShotProject([shot, shot])).toThrow();
  });
  it('scales padding for a portrait viewport without consuming the whole map', () => {
    const p = scalePadding(pose, 390, 700);
    expect(p.left + p.right).toBeLessThanOrEqual(390 * 0.8);
    expect(p.top + p.bottom).toBeLessThanOrEqual(700 * 0.8);
  });
  it('makes slow camera moves substantially longer and bounds very long moves', () => {
    expect(cameraMoveSeconds(12, 'slow')).toBe(27);
    expect(cameraMoveSeconds(12, 'normal')).toBe(12);
    expect(cameraMoveSeconds(12, 'fast')).toBeCloseTo(7.8);
    expect(cameraMoveSeconds(30, 'slow')).toBe(60);
  });
  it('keeps the cinematic tour on the fixture coordinate with loading holds and distinct angles', () => {
    const tour = presetSteps('demo-card', pose, pose, null, 12);
    expect(tour).toHaveLength(9);
    expect(tour[0].demo).toBe(true);
    expect(new Set(tour.map((s) => s.target?.center.join(','))).size).toBe(1);
    expect(new Set(tour.map((s) => s.target?.bearing)).size).toBeGreaterThanOrEqual(5);
    expect(tour[0].card).toBe('hide');
    expect(tour[1].card).toBe('show');
    expect(tour.slice(1).every((s) => s.card !== 'hide')).toBe(true);
    expect(tour[2].cardScroll).toBe(true);
    expect(tour[2].cardFocus).toBe('overview');
  });
  it('all presets have bounded poses; selected-asset shots require an actual selected coordinate', () => {
    for (const [id] of contentPresets)
      for (const s of presetSteps(id, pose, pose, [77, 13], 8)) {
        for (const p of [s.from, s.target])
          if (p) {
            expect(p.zoom).toBeLessThanOrEqual(19);
            expect(p.pitch).toBeLessThanOrEqual(55);
          }
      }
    expect(() => presetSteps('receipt', pose, pose, null, 8)).toThrow(/Select an asset/);
    expect(presetSteps('receipt', pose, pose, [77, 13], 8).map((s) => s.card)).toEqual([
      'hide',
      'show',
    ]);
  });
});
describe('camera player interruption', () => {
  it('plays presets in displayed order with five-second loading pauses at preset boundaries', () => {
    const plan = allPresetSequence(pose, pose, [77, 13], 12),
      starts = plan.filter((s) => s.settleSeconds !== undefined);
    expect(starts.map((s) => s.name)).toEqual(
      contentPresets.map(([id, label]) =>
        id === 'orbit'
          ? 'Orbit 1/4'
          : id === 'receipt'
            ? 'Approach location'
            : id === 'demo-card'
              ? 'Demo point approach'
              : label,
      ),
    );
    expect(starts.map((s) => s.settleSeconds)).toEqual([0, ...Array(22).fill(5)]);
    const withoutAsset = allPresetSequence(pose, pose, null, 12);
    expect(withoutAsset).toHaveLength(25);
    expect(withoutAsset.at(-1)?.name).toBe('Demo receipt reveal');
    expect(withoutAsset.some((s) => s.demo)).toBe(true);
  });
  function setup() {
    const states: PlayerState[] = [],
      moves: number[] = [];
    const player = new ContentPlayer({
      prepare: async () => {},
      move: (_s, d, signal) => {
        moves.push(d);
        return abortableDelay(d * 1000, signal);
      },
      hold: (d, signal) => abortableDelay(d * 1000, signal),
      stop: () => {},
      state: (s) => states.push(s),
    });
    return { player, states, moves };
  }
  it('pauses without a camera jump and resumes only the remaining movement', async () => {
    vi.useFakeTimers();
    const { player, states, moves } = setup();
    player.play([{ name: 'push', duration: 2, hold: 1, target: pose }]);
    await vi.advanceTimersByTimeAsync(500);
    player.pause();
    await vi.advanceTimersByTimeAsync(5000);
    expect(states.at(-1)?.status).toBe('paused');
    player.resume();
    await vi.advanceTimersByTimeAsync(2501);
    expect(moves[1]).toBeCloseTo(1.5);
    expect(states.at(-1)?.status).toBe('complete');
  });
  it('waits five seconds after preparation, and preserves the remaining pause when resumed', async () => {
    vi.useFakeTimers();
    const { player, states, moves } = setup();
    player.play([{ name: 'next preset', duration: 2, hold: 0, settleSeconds: 5, target: pose }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(moves).toHaveLength(0);
    expect(states.at(-1)?.phase).toBe('settling');
    player.pause();
    await vi.advanceTimersByTimeAsync(1000);
    player.resume();
    await vi.advanceTimersByTimeAsync(2999);
    expect(moves).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(moves).toEqual([2]);
    player.stop();
  });
  it('stopping an old plan prevents it advancing into the next shot', async () => {
    vi.useFakeTimers();
    const { player, states, moves } = setup();
    player.play([
      { name: 'one', duration: 2, hold: 0 },
      { name: 'two', duration: 2, hold: 0 },
    ]);
    await vi.advanceTimersByTimeAsync(100);
    player.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(moves).toHaveLength(1);
    expect(states.at(-1)?.status).toBe('idle');
  });
  it('starting another sequence cancels the previous sequence', async () => {
    vi.useFakeTimers();
    const { player, states } = setup();
    player.play([{ name: 'old', duration: 10, hold: 0 }]);
    await vi.advanceTimersByTimeAsync(50);
    player.play([{ name: 'new', duration: 0.2, hold: 0 }]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)?.status).toBe('complete');
    expect(states.at(-1)?.index).toBe(1);
  });
  it('waits three seconds, loops a preset back and forth, and stops cleanly', async () => {
    vi.useFakeTimers();
    const { player, states, moves } = setup();
    player.play(
      [{ name: 'push', duration: 0.5, hold: 0, from: pose, target: { ...pose, zoom: 6 } }],
      { delaySeconds: 3, loop: true },
    );
    await vi.advanceTimersByTimeAsync(2999);
    expect(moves).toHaveLength(0);
    expect(states.at(-1)?.phase).toBe('countdown');
    await vi.advanceTimersByTimeAsync(1);
    expect(moves).toHaveLength(1);
    expect(states.at(-1)?.looping).toBe(true);
    await vi.advanceTimersByTimeAsync(501);
    expect(moves).toHaveLength(2);
    player.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(moves).toHaveLength(2);
    expect(states.at(-1)?.status).toBe('idle');
  });
});
