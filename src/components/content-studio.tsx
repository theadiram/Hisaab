'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Clapperboard,
  Play,
  Pause,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  Maximize2,
  X,
  EyeOff,
  ChevronDown,
  RotateCcw,
} from 'lucide-react';
import type mapboxgl from 'mapbox-gl';
import type { Exploration } from '@/lib/exploration';
import {
  cardPresets,
  contentPresets,
  defaultPresentation,
  needsSelection,
  presetSteps,
  readShotProject,
  writeShotProject,
  scalePadding,
  cameraMoveSeconds,
  allPresetSequence,
  type CameraPose,
  type CameraSpeed,
  type ContentPresentation,
  type PresetId,
  type RunStep,
  type SavedShot,
  type RestoreContext,
} from '@/lib/content-mode';
import { ContentPlayer, abortableDelay, type PlayerState } from '@/lib/content-player';
import { remoteCommandSchema, type RemoteCommand, type RemoteSession } from '@/lib/content-remote';

type Props = {
  autoStart?: boolean;
  map: mapboxgl.Map | null;
  view: Exploration;
  selectedId: string | null;
  location: [number, number] | null;
  layers: SavedShot['layers'];
  theme: SavedShot['theme'];
  basemap: SavedShot['basemap'];
  remoteSession: RemoteSession | null;
  remoteHidden: boolean;
  onRemoteSession: (session: RemoteSession | null) => void;
  onPresentation: (p: ContentPresentation) => void;
  onContext: (context: RestoreContext) => void;
  onActivity: (playing: boolean) => void;
  onOpenDemo: () => void;
  onClose: () => void;
};
function camera(map: mapboxgl.Map): CameraPose {
  const c = map.getCenter(),
    p = map.getPadding(),
    el = map.getContainer();
  return {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    padding: { top: p.top ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0, right: p.right ?? 0 },
    width: el.clientWidth,
    height: el.clientHeight,
  };
}
function targetOptions(pose: CameraPose, map: mapboxgl.Map) {
  const el = map.getContainer();
  return { ...pose, padding: scalePadding(pose, el.clientWidth, el.clientHeight) };
}
const idleState: PlayerState = {
  status: 'idle',
  index: 0,
  total: 0,
  name: '',
  phase: 'preparing',
  looping: false,
};
const showcases = [
  {
    name: 'Country → scale → receipt',
    ids: ['india-reveal', 'north-south', 'ganges', 'fly', 'receipt'],
  },
  {
    name: 'Historical location scale',
    ids: ['india-reveal', 'north-south', 'east-west', 'push', 'hold'],
  },
  { name: 'Selected location story', ids: ['fly', 'top-down', 'arc', 'receipt', 'hold'] },
  { name: 'Landscape journey', ids: ['himalayas', 'ganges', 'deccan', 'west-coast', 'india-rise'] },
  { name: 'Coasts and islands', ids: ['west-coast', 'east-coast', 'islands', 'india-rise'] },
] as const;

export function ContentStudio(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [tab, setTab] = useState<'director' | 'showcase' | 'builder'>('director'),
    [collapsed, setCollapsed] = useState(false),
    [settings, setSettings] = useState<ContentPresentation>(defaultPresentation),
    [duration, setDuration] = useState(12),
    [speed, setSpeed] = useState<CameraSpeed>('slow'),
    [waitForImagery, setWaitForImagery] = useState(true),
    [shots, setShots] = useState<SavedShot[]>([]),
    [storageReady, setStorageReady] = useState(false),
    [notice, setNotice] = useState(''),
    [playback, setPlayback] = useState<PlayerState>(idleState),
    [pairCode, setPairCode] = useState(''),
    [pairBusy, setPairBusy] = useState(false);
  const controls = useRef({ settings, duration, speed, waitForImagery, collapsed });
  controls.current = { settings, duration, speed, waitForImagery, collapsed };
  const player = useRef<ContentPlayer | null>(null),
    lastPlan = useRef<RunStep[]>([]),
    lastPresetLoop = useRef(false),
    input = useRef<HTMLInputElement>(null),
    running = useRef(false),
    reduced = useRef(false);
  useEffect(() => {
    reduced.current = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hisaab-content-shots-v1');
      if (saved) setShots(readShotProject(saved));
    } catch {
      setNotice(
        'The saved shot file could not be read. Import a valid backup or start a new timeline.',
      );
    }
    setStorageReady(true);
  }, []);
  useEffect(() => {
    if (storageReady)
      try {
        localStorage.setItem('hisaab-content-shots-v1', writeShotProject(shots));
      } catch {
        setNotice('Browser storage is full. Export your shot file to keep a backup.');
      }
  }, [shots, storageReady]);
  useEffect(() => {
    props.onPresentation(settings);
  }, [settings, props.onPresentation]);
  useEffect(() => {
    const map = props.map;
    if (!map) return;
    const wait = async (predicate: () => boolean, signal: AbortSignal, message: string) => {
      const until = performance.now() + 20000;
      while (!predicate()) {
        signal.throwIfAborted();
        if (performance.now() > until) throw new Error(message);
        await abortableDelay(80, signal);
      }
    };
    player.current = new ContentPlayer({
      async prepare(step, signal, resume) {
        if (!resume) {
          if (step.shot) {
            setSettings(step.shot.presentation);
            latest.current.onContext({
              view: step.shot.view,
              theme: step.shot.theme,
              layers: step.shot.layers,
              basemap: step.shot.basemap,
            });
            const wanted = step.shot.view;
            await wait(
              () => {
                const p = latest.current;
                return (
                  p.view.screen === wanted.screen &&
                  p.view.year === wanted.year &&
                  p.view.measure === wanted.measure &&
                  p.view.purpose === wanted.purpose &&
                  p.view.state === wanted.state &&
                  p.view.asset === wanted.asset &&
                  p.view.work === wanted.work &&
                  (wanted.screen !== 'asset' || p.selectedId === (wanted.work ?? wanted.asset))
                );
              },
              signal,
              'The saved source record is unavailable. Stop and review the selected record.',
            );
          }
          if (step.demo && latest.current.selectedId !== 'demo-complete-school-card') {
            latest.current.onOpenDemo();
            await wait(
              () => latest.current.selectedId === 'demo-complete-school-card',
              signal,
              'The demo card could not open.',
            );
          }
          if (step.card || step.cardFocus)
            setSettings((s) => ({
              ...s,
              card: step.card ?? s.card,
              cardFocus: step.cardFocus ?? s.cardFocus,
            }));
          await abortableDelay(120, signal);
          map.resize();
          if (step.from) map.jumpTo(targetOptions(step.from, map));
        }
        if (controls.current.waitForImagery)
          await wait(
            () => map.isStyleLoaded() && map.areTilesLoaded() && !map.isMoving(),
            signal,
            'Imagery is still loading. Retry the shot, or turn off “Wait for imagery” to use the current frame.',
          );
      },
      async move(step, seconds, signal) {
        if (step.cardScroll) {
          const card = document.querySelector<HTMLElement>('[data-asset-card]');
          if (!card) throw new Error('The project card is not ready. Reopen the tour.');
          const start = card.scrollTop,
            end = Math.max(0, card.scrollHeight - card.clientHeight);
          if (reduced.current || seconds === 0) {
            card.scrollTop = end;
            return;
          }
          await new Promise<void>((resolve, reject) => {
            let frame = 0;
            const began = performance.now();
            const cleanup = () => {
              cancelAnimationFrame(frame);
              signal.removeEventListener('abort', abort);
            };
            const abort = () => {
              cleanup();
              reject(signal.reason);
            };
            const tick = (now: number) => {
              if (signal.aborted) {
                abort();
                return;
              }
              const t = Math.min(1, (now - began) / (seconds * 1000));
              card.scrollTop =
                start + (Math.max(end, card.scrollHeight - card.clientHeight) - start) * t;
              if (t < 1) frame = requestAnimationFrame(tick);
              else {
                cleanup();
                resolve();
              }
            };
            signal.addEventListener('abort', abort, { once: true });
            frame = requestAnimationFrame(tick);
          });
          return;
        }
        if (!step.target) return;
        signal.throwIfAborted();
        map.stop();
        const options = targetOptions(step.target, map);
        if (reduced.current || seconds === 0) {
          map.jumpTo(options);
          return;
        }
        const current = camera(map);
        if (
          Math.abs(current.center[0] - step.target.center[0]) < 1e-7 &&
          Math.abs(current.center[1] - step.target.center[1]) < 1e-7 &&
          Math.abs(current.zoom - step.target.zoom) < 1e-7 &&
          Math.abs(current.pitch - step.target.pitch) < 1e-7 &&
          Math.abs(((((current.bearing - step.target.bearing) % 360) + 540) % 360) - 180) < 1e-7
        ) {
          map.jumpTo(options);
          await abortableDelay(seconds * 1000, signal);
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
              cleanup();
              resolve();
            },
            abort = () => {
              cleanup();
              reject(signal.reason);
            },
            cleanup = () => {
              map.off('moveend', finish);
              signal.removeEventListener('abort', abort);
            };
          map.once('moveend', finish);
          signal.addEventListener('abort', abort, { once: true });
          map.easeTo({ ...options, duration: seconds * 1000, easing: (t) => t * t * (3 - 2 * t) });
        });
      },
      hold: (seconds, signal) => abortableDelay(seconds * 1000, signal),
      stop: () => map.stop(),
      state: (state) => {
        setPlayback(state);
        running.current = state.status === 'playing';
        latest.current.onActivity(running.current);
      },
    });
    const interrupt = () => {
      if (controls.current.collapsed) setCollapsed(false);
      if (running.current) {
        player.current?.stop();
        setNotice('Camera movement stopped. You can frame the map manually.');
      }
    };
    const canvas = map.getCanvas();
    canvas.addEventListener('pointerdown', interrupt);
    canvas.addEventListener('wheel', interrupt, { passive: true });
    return () => {
      canvas.removeEventListener('pointerdown', interrupt);
      canvas.removeEventListener('wheel', interrupt);
      player.current?.stop();
      player.current = null;
      latest.current.onActivity(false);
    };
  }, [props.map]);
  const seconds = () => Math.max(0.5, controls.current.duration);
  function poses() {
    const map = latest.current.map;
    if (!map) throw new Error('The map is preparing. Try again when it is ready.');
    const current = camera(map),
      showCard = controls.current.settings.card !== 'hide' && !!latest.current.selectedId;
    current.padding =
      current.width <= 760
        ? {
            top: 170,
            bottom: showCard ? Math.min(current.height * 0.52 + 60, current.height * 0.65) : 55,
            left: 28,
            right: 28,
          }
        : {
            top: 75,
            bottom: 60,
            left: 55,
            right: showCard ? Math.min(500, current.width * 0.42) : 55,
          };
    const fit = map.cameraForBounds(
        [
          [67.8, 6.5],
          [97.5, 37.2],
        ],
        { padding: 55, bearing: 0 },
      ),
      c = fit?.center;
    const center: [number, number] = Array.isArray(c)
      ? [c[0], c[1]]
      : c && 'lng' in c
        ? [c.lng, c.lat]
        : [79.5, 22];
    const india: CameraPose = {
      ...current,
      center,
      zoom: Math.max(0, fit?.zoom ?? 3.5),
      pitch: 0,
      bearing: 0,
      padding: { top: 55, bottom: 55, left: 55, right: 55 },
    };
    return { current, india };
  }
  function makePreset(id: PresetId, mapOnly = false, previous?: CameraPose): RunStep[] {
    const p = poses();
    if (previous)
      p.current = {
        ...p.current,
        center: previous.center,
        zoom: previous.zoom,
        pitch: previous.pitch,
        bearing: previous.bearing,
      };
    if (mapOnly) p.current.padding = { top: 65, bottom: 60, left: 55, right: 55 };
    return presetSteps(id, p.current, p.india, latest.current.location, seconds());
  }
  function play(
    plan: RunStep[],
    overrides?: Partial<RestoreContext>,
    options: { delaySeconds?: number; loop?: boolean } = {},
  ) {
    if (!plan.length || !latest.current.map) return;
    const current = latest.current,
      context: SavedShot = {
        id: crypto.randomUUID(),
        name: 'Director context',
        pose: camera(current.map!),
        duration: controls.current.duration,
        hold: 0,
        presentation: controls.current.settings,
        view: overrides?.view ?? current.view,
        theme: overrides?.theme ?? current.theme,
        basemap: overrides?.basemap ?? current.basemap,
        layers: overrides?.layers ?? current.layers,
      };
    const frozen = plan.map((step, i) => ({
      ...step,
      duration: cameraMoveSeconds(step.duration, controls.current.speed),
      ...(i === 0 ? { from: step.from ?? context.pose, shot: step.shot ?? context } : {}),
    }));
    setNotice('');
    lastPlan.current = plan.map((step) => ({ ...step }));
    lastPresetLoop.current = !!options.loop;
    player.current?.play(frozen, options);
  }
  function replayLast() {
    if (lastPlan.current.length)
      play(
        lastPlan.current,
        undefined,
        lastPresetLoop.current ? { delaySeconds: 3, loop: true } : {},
      );
  }
  function preset(id: PresetId) {
    try {
      const context =
        id === 'demo-card'
          ? {
              view: {
                ...latest.current.view,
                screen: 'asset' as const,
                state: '29',
                asset: null,
                work: 'demo-complete-school-card',
                exploring: true,
              },
            }
          : undefined;
      play(makePreset(id), context, { delaySeconds: 3, loop: id !== 'demo-card' });
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function showcase(ids: readonly PresetId[]) {
    try {
      const filtered = ids.filter((id) => !needsSelection(id) || latest.current.location);
      setSettings((s) => ({ ...s, card: 'hide' }));
      const plan: RunStep[] = [];
      let previous: CameraPose | undefined;
      for (const id of filtered) {
        const steps = makePreset(id, !needsSelection(id), previous);
        plan.push(...steps);
        previous = steps.at(-1)?.target ?? previous;
      }
      if (plan[0]) plan[0].card = 'hide';
      play(plan, {
        view: { ...latest.current.view, exploring: true },
        layers: { ...latest.current.layers, historical: true },
      });
      if (filtered.length < ids.length)
        setNotice(
          'No asset selected: playing the map-only portion. Select a dot to include its receipt.',
        );
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  function playAllPresets() {
    try {
      const p = poses(),
        presentation = { ...controls.current.settings, clean: true, card: 'hide' as const };
      controls.current.settings = presentation;
      setSettings(presentation);
      setCollapsed(true);
      play(
        allPresetSequence(p.current, p.india, latest.current.location, seconds()),
        {
          view: { ...latest.current.view, exploring: true },
          layers: { ...latest.current.layers, historical: true },
        },
        { delaySeconds: 3 },
      );
      if (!latest.current.location)
        setNotice(
          'Playing all country, region and current-view presets in order. Select a dot before starting to include the asset presets.',
        );
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!props.autoStart) {
      autoStarted.current = false;
      return;
    }
    if (!props.map || !player.current || autoStarted.current) return;
    autoStarted.current = true;
    playAllPresets();
    return () => {
      autoStarted.current = false;
    };
  }, [props.autoStart, props.map]);
  function cardPreset(focus: ContentPresentation['cardFocus']) {
    player.current?.stop();
    setSettings((s) => ({ ...s, clean: true, card: 'emphasis', cardFocus: focus }));
    const present =
      focus === 'overview' ||
      !!document.querySelector(`[data-asset-card] [data-card-section="${focus}"]`);
    setNotice(
      present
        ? 'Card framing applied. Save the camera to keep this section in your timeline.'
        : 'This record has no ' +
            (focus === 'people'
              ? 'documented responsible roles'
              : focus === 'timeline'
                ? 'funding timeline'
                : focus === 'payments'
                  ? 'individual payment details'
                  : 'source section') +
            '. Showing the evidence summary instead.',
    );
  }
  function saveShot() {
    if (!props.map) return;
    if (shots.length >= 60) {
      setNotice('This timeline has 60 shots. Export it and start another.');
      return;
    }
    const shot: SavedShot = {
      id: crypto.randomUUID(),
      name: `Shot ${shots.length + 1}${props.selectedId ? ' · selected asset' : ''}`,
      pose: camera(props.map),
      duration,
      hold: 1,
      presentation: settings,
      view: props.view,
      theme: props.theme,
      basemap: props.basemap,
      layers: props.layers,
    };
    setShots((s) => [...s, shot]);
    setTab('builder');
    setNotice('Camera, selection, framing, theme and layers saved on this browser.');
  }
  function timeline() {
    play(
      shots.map((shot) => ({
        name: shot.name,
        target: shot.pose,
        duration: shot.duration,
        hold: shot.hold,
        shot,
      })),
    );
  }
  function reorder(index: number, delta: number) {
    setShots((s) => {
      const next = [...s],
        other = index + delta;
      if (other < 0 || other >= next.length) return s;
      [next[index], next[other]] = [next[other], next[index]];
      return next;
    });
  }
  function exportShots() {
    const url = URL.createObjectURL(
        new Blob([writeShotProject(shots)], { type: 'application/json' }),
      ),
      a = document.createElement('a');
    a.href = url;
    a.download = 'hisaab-shot-timeline.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function pairRemote() {
    setPairBusy(true);
    try {
      const r = await fetch('/api/v1/content-control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'create' }),
        }),
        value = await r.json();
      if (!r.ok) throw new Error(value.error ?? 'Remote control could not start.');
      setPairCode(value.code);
      props.onRemoteSession(value.session);
      setNotice(
        'Remote session ready. Open /studio in your controller browser and enter this one-time code.',
      );
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setPairBusy(false);
    }
  }
  async function endRemote() {
    if (props.remoteSession)
      try {
        await fetch('/api/v1/content-control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'close', session: props.remoteSession }),
        });
      } catch {}
    setPairCode('');
    props.onRemoteSession(null);
    setNotice('Remote controller disconnected.');
  }
  const remoteActions = useRef<(command: RemoteCommand) => void>(() => {});
  remoteActions.current = (command) => {
    if (command.type === 'demo') {
      props.onOpenDemo();
      return;
    }
    if (command.type === 'preset') {
      preset(command.id);
      return;
    }
    if (command.type === 'card') {
      cardPreset(command.focus);
      return;
    }
    if (command.type === 'visibility') {
      setSettings((s) => ({
        ...s,
        card: command.card,
        clean: command.card === 'emphasis' ? true : s.clean,
      }));
      return;
    }
    if (command.type === 'showcase') {
      showcase(
        command.id === 'country-scale-receipt'
          ? ['india-reveal', 'north-south', 'ganges', 'fly', 'receipt']
          : ['fly', 'top-down', 'arc', 'receipt', 'hold'],
      );
      return;
    }
    if (command.type === 'playback') {
      if (command.action === 'pause') player.current?.pause();
      else if (command.action === 'resume') player.current?.resume();
      else if (command.action === 'stop') player.current?.stop();
      else replayLast();
      return;
    }
    if (command.type === 'look')
      props.onContext({
        view: latest.current.view,
        layers: latest.current.layers,
        theme: command.theme ?? latest.current.theme,
        basemap: command.basemap ?? latest.current.basemap,
      });
  };
  useEffect(() => {
    const session = props.remoteSession;
    if (!session || !props.map) return;
    let stopped = false,
      cursor = 0,
      timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped) return;
      try {
        const r = await fetch('/api/v1/content-control', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ action: 'poll', session, after: cursor }),
        });
        if (r.status === 410) {
          props.onRemoteSession(null);
          setPairCode('');
          setNotice('Remote session ended. Open Content Mode to pair again.');
          return;
        }
        if (r.ok) {
          const value = (await r.json()) as { commands: { id: string; command: unknown }[] };
          for (const item of value.commands) {
            cursor = Math.max(cursor, Number(item.id) || cursor);
            const parsed = remoteCommandSchema.safeParse(item.command);
            if (parsed.success) remoteActions.current(parsed.data);
          }
        }
      } catch {}
      if (!stopped) timer = setTimeout(poll, 220);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [props.remoteSession?.id, props.remoteSession?.key, props.map]);
  const actions = useRef({
    saveShot,
    play: () => {
      if (playback.status === 'paused') player.current?.resume();
      else if (playback.status === 'playing') player.current?.pause();
      else if (lastPlan.current.length) replayLast();
      else preset('push');
    },
  });
  actions.current = {
    saveShot,
    play: () => {
      if (playback.status === 'paused') player.current?.resume();
      else if (playback.status === 'playing') player.current?.pause();
      else if (lastPlan.current.length) replayLast();
      else preset('push');
    },
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        player.current?.stop();
        setCollapsed(false);
        return;
      }
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          (e.target.matches('input:not([type=checkbox]):not([type=radio]),select,textarea') ||
            e.target.isContentEditable))
      )
        return;
      if (e.code === 'Space') {
        if (e.target instanceof HTMLInputElement) return;
        e.preventDefault();
        actions.current.play();
      } else if (e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setCollapsed((v) => !v);
      } else if (e.key.toLowerCase() === 'k') {
        e.preventDefault();
        actions.current.saveShot();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  const status =
    playback.status === 'playing'
      ? playback.phase === 'countdown'
        ? `Starting ${playback.name} in 3 seconds…`
        : playback.phase === 'settling'
          ? `Loading pause · 5 seconds before ${playback.name}`
          : `${playback.looping ? 'Looping · ' : ''}${playback.index + 1}/${playback.total} · ${playback.name} · ${playback.phase}`
      : playback.status === 'paused'
        ? 'Paused · resume from this camera position'
        : playback.status === 'complete'
          ? 'Sequence complete'
          : playback.status === 'error'
            ? playback.message
            : props.map
              ? 'Ready to frame a shot'
              : 'Preparing map…';
  return createPortal(
    <aside
      className={
        'content-studio' +
        (collapsed ? ' is-collapsed' : '') +
        (props.remoteHidden ? ' is-remote-hidden' : '')
      }
      aria-label="Content studio"
    >
      <header>
        <strong>
          <Clapperboard size={17} />
          Content Mode
        </strong>
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand content controls' : 'Hide content controls'}
        >
          <ChevronDown size={17} />
        </button>
        <button
          aria-label="Exit content mode"
          onClick={() => {
            player.current?.stop();
            props.onClose();
          }}
        >
          <X size={17} />
        </button>
      </header>
      {!collapsed && (
        <>
          <nav aria-label="Content mode tools">
            {(['director', 'showcase', 'builder'] as const).map((t) => (
              <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
                {t === 'builder' ? 'Shot Builder' : t === 'showcase' ? 'Showcase' : 'Director'}
              </button>
            ))}
          </nav>
          <div className="content-studio-body">
            <button className="content-play-all" onClick={playAllPresets} disabled={!props.map}>
              <Play size={16} />
              Play every preset in order · 5s pauses
            </button>
            <div className="content-options">
              <label>
                Frame
                <select
                  aria-label="Content framing"
                  value={settings.frame}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      frame: e.target.value as ContentPresentation['frame'],
                    }))
                  }
                >
                  <option value="screen">Current screen</option>
                  <option value="wide">16:9 landscape</option>
                  <option value="portrait">9:16 portrait</option>
                  <option value="square">1:1 square</option>
                </select>
              </label>
              <label>
                Speed
                <select
                  aria-label="Camera speed"
                  value={speed}
                  onChange={(e) => setSpeed(e.target.value as CameraSpeed)}
                >
                  <option value="slow">Slow · 2.25×</option>
                  <option value="normal">Normal · 1×</option>
                  <option value="fast">Fast · 0.65×</option>
                </select>
              </label>
              <label>
                Movement
                <input
                  aria-label="Shot duration in seconds"
                  type="number"
                  min="2"
                  max="30"
                  value={duration}
                  onChange={(e) =>
                    setDuration(Math.min(30, Math.max(2, Number(e.target.value) || 2)))
                  }
                />
                <small>seconds</small>
              </label>
            </div>
            <div className="content-look">
              <label>
                Theme
                <select
                  aria-label="Content theme"
                  value={props.theme}
                  onChange={(e) =>
                    props.onContext({
                      view: props.view,
                      layers: props.layers,
                      theme: e.target.value as 'light' | 'dark',
                    })
                  }
                >
                  <option value="dark">Obsidian / dusk</option>
                  <option value="light">Day / light</option>
                </select>
              </label>
              <label>
                Map look
                <select
                  aria-label="Content map look"
                  value={props.basemap}
                  onChange={(e) =>
                    props.onContext({
                      view: props.view,
                      layers: props.layers,
                      theme: props.theme,
                      basemap: e.target.value as 'satellite' | 'streets',
                    })
                  }
                >
                  <option value="satellite">Satellite</option>
                  <option value="streets">Map</option>
                </select>
              </label>
            </div>
            <div className="content-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={settings.clean}
                  onChange={(e) => setSettings((s) => ({ ...s, clean: e.target.checked }))}
                />
                Clean frame
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.count}
                  onChange={(e) => setSettings((s) => ({ ...s, count: e.target.checked }))}
                />
                Archive count
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={waitForImagery}
                  onChange={(e) => setWaitForImagery(e.target.checked)}
                />
                Wait for imagery
              </label>
            </div>
            <label className="content-card-choice">
              Receipt
              <select
                aria-label="Receipt presentation"
                value={settings.card}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    card: e.target.value as ContentPresentation['card'],
                  }))
                }
              >
                <option value="show">Map + card</option>
                <option value="hide">Map only</option>
                <option value="emphasis">Card emphasis</option>
              </select>
            </label>
            {tab === 'director' && (
              <section className="content-card-presets" aria-label="Card shot presets">
                <h3>Card shots</h3>
                <p>
                  {props.selectedId
                    ? 'Frame one part of the receipt for your narration.'
                    : 'Select a dot to frame its receipt.'}
                </p>
                <div>
                  {cardPresets.map(([id, label, description]) => (
                    <button
                      key={id}
                      disabled={!props.selectedId}
                      aria-pressed={settings.cardFocus === id && settings.card === 'emphasis'}
                      title={description}
                      onClick={() => cardPreset(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  disabled={!props.selectedId}
                  onClick={() => {
                    player.current?.stop();
                    setSettings((s) => ({ ...s, card: 'show', cardFocus: 'overview' }));
                    setNotice('Standard card framing restored.');
                  }}
                >
                  Reset card framing
                </button>
                <button
                  className="content-demo-card-link"
                  onClick={() => {
                    player.current?.stop();
                    props.onOpenDemo();
                    setNotice(
                      'Opened the fictional complete-card example. The demo label stays visible on camera.',
                    );
                  }}
                >
                  Open complete demo card{' '}
                  <small>Fictional sample · excluded from real records</small>
                </button>
                <div className="content-remote-pair">
                  {props.remoteSession ? (
                    <>
                      <span className="content-remote-state">
                        <i />
                        Remote control ready
                      </span>
                      <strong>{pairCode || 'Paired session'}</strong>
                      <small>
                        Open <b>/studio</b> in the controller browser and enter this code.
                      </small>
                      <button onClick={() => void endRemote()}>End remote session</button>
                    </>
                  ) : (
                    <>
                      <button disabled={pairBusy || !props.map} onClick={() => void pairRemote()}>
                        {pairBusy ? 'Starting…' : 'Pair remote controller'}
                      </button>
                      <small>Control the filming tab from another browser window.</small>
                    </>
                  )}
                </div>
              </section>
            )}
            {tab === 'director' && (
              <div className="content-presets">
                {['Country', 'Region', 'Current view', 'Selected asset', 'Demo'].map((group) => (
                  <section key={group}>
                    <h3>{group}</h3>
                    <div>
                      {contentPresets
                        .filter((p) => p[2] === group)
                        .map(([id, label, , description]) => (
                          <button
                            key={id}
                            disabled={!props.map || (needsSelection(id) && !props.location)}
                            title={
                              needsSelection(id) && !props.location
                                ? 'Select a dot first'
                                : description
                            }
                            onClick={() => preset(id)}
                          >
                            {label}
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
            {tab === 'showcase' && (
              <div className="content-showcases">
                {showcases.map((s) => (
                  <button key={s.name} disabled={!props.map} onClick={() => showcase(s.ids)}>
                    <Play size={15} />
                    <span>
                      <strong>{s.name}</strong>
                      <small>
                        {s.ids.map((id) => contentPresets.find((p) => p[0] === id)![1]).join(' → ')}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {tab === 'builder' && (
              <div className="content-timeline">
                <div className="content-file-actions">
                  <button onClick={saveShot} disabled={!props.map}>
                    <Plus size={14} />
                    Save camera
                  </button>
                  <button onClick={timeline} disabled={!shots.length || !props.map}>
                    <Play size={14} />
                    Play timeline
                  </button>
                  <button onClick={exportShots} disabled={!shots.length}>
                    <Download size={14} />
                    Export
                  </button>
                  <button onClick={() => input.current?.click()}>
                    <Upload size={14} />
                    Import
                  </button>
                  <input
                    ref={input}
                    hidden
                    type="file"
                    accept=".json,application/json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        if (file.size > 250000) throw new Error('Shot file is too large.');
                        const restored = readShotProject(await file.text());
                        player.current?.stop();
                        setShots(restored);
                        setNotice(
                          `${restored.length} camera shots imported. No financial data was imported.`,
                        );
                      } catch {
                        setNotice('Invalid shot file. Your current timeline was kept.');
                      }
                      e.target.value = '';
                    }}
                  />
                </div>
                {!shots.length && (
                  <p>
                    Frame the map, select a card if you want one, then save the camera. Each shot
                    remembers its record and look.
                  </p>
                )}
                {shots.map((shot, i) => (
                  <article
                    key={shot.id}
                    className={
                      playback.status === 'playing' && playback.index === i ? 'is-playing' : ''
                    }
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <input
                        aria-label={`Shot ${i + 1} name`}
                        maxLength={80}
                        value={shot.name}
                        onChange={(e) =>
                          setShots((s) =>
                            s.map((x) =>
                              x.id === shot.id
                                ? { ...x, name: e.target.value || 'Untitled shot' }
                                : x,
                            ),
                          )
                        }
                      />
                      <small>
                        {shot.presentation.frame} · {shot.presentation.cardFocus} · {shot.theme} ·{' '}
                        {shot.view.screen === 'asset' ? 'selected record' : shot.view.screen}
                      </small>
                      <label>
                        Move{' '}
                        <input
                          aria-label={`Shot ${i + 1} movement seconds`}
                          type="number"
                          min=".5"
                          max="60"
                          step=".5"
                          value={shot.duration}
                          onChange={(e) =>
                            setShots((s) =>
                              s.map((x) =>
                                x.id === shot.id
                                  ? {
                                      ...x,
                                      duration: Math.max(
                                        0.5,
                                        Math.min(60, Number(e.target.value) || 0.5),
                                      ),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        s · Hold{' '}
                        <input
                          aria-label={`Shot ${i + 1} hold seconds`}
                          type="number"
                          min="0"
                          max="30"
                          value={shot.hold}
                          onChange={(e) =>
                            setShots((s) =>
                              s.map((x) =>
                                x.id === shot.id
                                  ? {
                                      ...x,
                                      hold: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                                    }
                                  : x,
                              ),
                            )
                          }
                        />
                        s
                      </label>
                    </div>
                    <div className="content-shot-actions">
                      <button
                        aria-label={`Preview shot ${i + 1}`}
                        onClick={() =>
                          play([
                            {
                              name: shot.name,
                              target: shot.pose,
                              duration: shot.duration,
                              hold: shot.hold,
                              shot,
                            },
                          ])
                        }
                      >
                        <Play size={13} />
                      </button>
                      <button
                        aria-label={`Move shot ${i + 1} up`}
                        disabled={!i}
                        onClick={() => reorder(i, -1)}
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        aria-label={`Move shot ${i + 1} down`}
                        disabled={i === shots.length - 1}
                        onClick={() => reorder(i, 1)}
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        aria-label={`Delete shot ${i + 1}`}
                        onClick={() => {
                          player.current?.stop();
                          setShots((s) => s.filter((x) => x.id !== shot.id));
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
            <p className="content-help">
              Opening Content Mode runs every available camera preset once, in the order listed,
              with a 5-second loading pause at each new starting position. Individual preset buttons
              still loop until you stop. Space: play/pause · H: hide/show · K: save camera · Esc:
              stop. Tap the map to restore hidden controls. Presets default to Slow · 2.25× with a
              12-second base move. Use your screen recorder; exported JSON stores shots, not video.
              Device reduced-motion settings are respected.
            </p>
          </div>
        </>
      )}
      <footer>
        <p role="status">{status}</p>
        {notice && !collapsed && <p className="content-notice">{notice}</p>}
        <div>
          <button
            aria-label={
              playback.status === 'playing'
                ? 'Pause camera sequence'
                : playback.status === 'paused'
                  ? 'Resume camera sequence'
                  : 'Replay last sequence'
            }
            onClick={() => actions.current.play()}
            disabled={!props.map}
          >
            {playback.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button aria-label="Stop camera sequence" onClick={() => player.current?.stop()}>
            <Square size={14} />
          </button>
          <button aria-label="Save current camera" onClick={saveShot} disabled={!props.map}>
            <Plus size={16} />
          </button>
          <button
            aria-label="Replay sequence from start"
            onClick={replayLast}
            disabled={!lastPlan.current.length}
          >
            <RotateCcw size={16} />
          </button>
          <button
            aria-label="Fullscreen content view"
            onClick={() => {
              const task = document.fullscreenElement
                ? document.exitFullscreen()
                : document.documentElement.requestFullscreen();
              void task.catch(() => setNotice('Fullscreen is unavailable in this browser.'));
            }}
          >
            <Maximize2 size={16} />
          </button>
          <button
            aria-label="Toggle clean content frame"
            aria-pressed={settings.clean}
            onClick={() => setSettings((s) => ({ ...s, clean: !s.clean }))}
          >
            <EyeOff size={16} />
          </button>
        </div>
      </footer>
    </aside>,
    document.body,
  );
}
