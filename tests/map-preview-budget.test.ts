import { afterEach, expect, it, vi } from 'vitest';
import { mapPreviewBudget } from '../src/lib/map-preview-budget';

afterEach(() => vi.useRealTimers());

it('allows slow tiles to load before starting the capture budget', () => {
  vi.useFakeTimers();
  const unavailable = vi.fn();
  const budget = mapPreviewBudget(unavailable);
  vi.advanceTimersByTime(30_000);
  expect(unavailable).not.toHaveBeenCalled();
  budget.settled();
  vi.advanceTimersByTime(19_999);
  expect(unavailable).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(unavailable).toHaveBeenCalledTimes(1);
});

it('caps the whole wait even when tiles settle just before the loading deadline', () => {
  vi.useFakeTimers();
  const unavailable = vi.fn();
  const budget = mapPreviewBudget(unavailable);
  vi.advanceTimersByTime(59_000);
  budget.settled();
  vi.advanceTimersByTime(1_000);
  expect(unavailable).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(20_000);
  expect(unavailable).toHaveBeenCalledTimes(1);
});

it('cancels timers after capture or unmount and does not restart on repeated idle events', () => {
  vi.useFakeTimers();
  const unavailable = vi.fn();
  const budget = mapPreviewBudget(unavailable);
  budget.settled();
  vi.advanceTimersByTime(10_000);
  budget.settled();
  vi.advanceTimersByTime(10_000);
  expect(unavailable).toHaveBeenCalledTimes(1);
  const cancelled = mapPreviewBudget(unavailable);
  cancelled.cancel();
  cancelled.settled();
  vi.advanceTimersByTime(60_000);
  expect(unavailable).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
