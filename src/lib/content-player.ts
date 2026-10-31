import type { RunStep } from './content-mode';
export type PlayerState = {
  status: 'idle' | 'playing' | 'paused' | 'complete' | 'error';
  index: number;
  total: number;
  name: string;
  phase: 'countdown' | 'preparing' | 'settling' | 'moving' | 'holding';
  looping: boolean;
  message?: string;
};
type Runtime = {
  prepare: (step: RunStep, signal: AbortSignal, resume: boolean) => Promise<void>;
  move: (step: RunStep, seconds: number, signal: AbortSignal) => Promise<void>;
  hold: (seconds: number, signal: AbortSignal) => Promise<void>;
  stop: () => void;
  state: (state: PlayerState) => void;
};
type PausedState = {
  phase: PlayerState['phase'];
  remaining: number;
  index: number;
  direction: 1 | -1;
} | null;
type PlayOptions = { delaySeconds?: number; loop?: boolean };
export class ContentPlayer {
  private controller: AbortController | null = null;
  private steps: RunStep[] = [];
  private index = 0;
  private phase: PlayerState['phase'] = 'preparing';
  private started = 0;
  private seconds = 0;
  private paused: PausedState = null;
  private looping = false;
  private direction: 1 | -1 = 1;
  constructor(private runtime: Runtime) {}
  play(steps: RunStep[], options: PlayOptions = {}) {
    this.cancel();
    this.steps = steps;
    this.index = 0;
    this.paused = null;
    this.looping = !!options.loop;
    this.direction = 1;
    void this.run(undefined, Math.max(0, options.delaySeconds ?? 0));
  }
  pause() {
    if (!this.controller) return;
    this.paused = {
      phase: this.phase,
      remaining: Math.max(0, this.seconds - (performance.now() - this.started) / 1000),
      index: this.index,
      direction: this.direction,
    };
    this.cancel();
    this.emit('paused');
  }
  resume() {
    if (this.paused && this.steps.length) void this.run(this.paused);
  }
  stop() {
    this.cancel();
    this.paused = null;
    this.steps = [];
    this.index = 0;
    this.looping = false;
    this.direction = 1;
    this.emit('idle');
  }
  private cancel() {
    this.controller?.abort();
    this.controller = null;
    this.runtime.stop();
  }
  private sequence() {
    return this.direction === 1 ? this.steps : this.reverseSteps();
  }
  private emit(status: PlayerState['status'], message?: string) {
    const sequence = this.sequence();
    this.runtime.state({
      status,
      index: this.index,
      total: this.steps.length,
      name: sequence[this.index]?.name ?? '',
      phase: this.phase,
      looping: this.looping,
      message,
    });
  }
  private reverseSteps() {
    return this.steps.map((_, offset) => {
      const i = this.steps.length - 1 - offset,
        step = this.steps[i];
      return {
        ...step,
        from: step.target,
        target: i > 0 ? this.steps[i - 1].target : step.from,
        card: undefined,
        shot: undefined,
      };
    });
  }
  private async run(resume?: NonNullable<PausedState>, delaySeconds = 0) {
    const controller = new AbortController();
    this.controller = controller;
    this.paused = null;
    const { signal } = controller;
    try {
      if (resume?.phase === 'countdown' || (!resume && delaySeconds > 0)) {
        this.phase = 'countdown';
        this.seconds = resume?.phase === 'countdown' ? resume.remaining : delaySeconds;
        this.started = performance.now();
        this.emit('playing');
        await abortableDelay(this.seconds * 1000, signal);
        signal.throwIfAborted();
        resume = undefined;
      }
      while (this.controller === controller) {
        const sequence = this.sequence();
        for (this.index = resume?.index ?? 0; this.index < sequence.length; this.index++) {
          const step = sequence[this.index];
          this.phase = 'preparing';
          this.seconds = 0;
          this.started = performance.now();
          this.emit('playing');
          await this.runtime.prepare(step, signal, !!resume && resume.phase !== 'preparing');
          signal.throwIfAborted();
          if ((!resume || resume.phase === 'settling') && (step.settleSeconds ?? 0) > 0) {
            this.phase = 'settling';
            this.seconds = resume?.phase === 'settling' ? resume.remaining : step.settleSeconds!;
            this.started = performance.now();
            this.emit('playing');
            await this.runtime.hold(this.seconds, signal);
            signal.throwIfAborted();
            resume = undefined;
          }
          if (resume?.phase !== 'holding') {
            this.phase = 'moving';
            this.seconds = resume?.phase === 'moving' ? resume.remaining : step.duration;
            this.started = performance.now();
            this.emit('playing');
            await this.runtime.move(step, this.seconds, signal);
            signal.throwIfAborted();
          }
          this.phase = 'holding';
          this.seconds = resume?.phase === 'holding' ? resume.remaining : step.hold;
          this.started = performance.now();
          this.emit('playing');
          await this.runtime.hold(this.seconds, signal);
          signal.throwIfAborted();
          resume = undefined;
        }
        if (!this.looping) break;
        this.direction = this.direction === 1 ? -1 : 1;
        this.index = 0;
      }
      if (this.controller === controller) {
        this.controller = null;
        this.emit('complete');
      }
    } catch (e) {
      if (!signal.aborted && this.controller === controller) {
        this.controller = null;
        this.runtime.stop();
        this.emit('error', e instanceof Error ? e.message : 'Unable to play this shot.');
      }
    }
  }
}
export function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
