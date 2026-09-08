import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_DECISION_DURATION_MS,
  countdownSnapshot,
  startAutoDecisionCountdown,
} from './autoDecision';

describe('auto-decision countdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a full minute and drains to zero', () => {
    expect(countdownSnapshot(70_000, AUTO_DECISION_DURATION_MS, 10_000)).toEqual({
      remainingSeconds: 60,
      remainingPercent: 100,
    });
    expect(countdownSnapshot(70_000, AUTO_DECISION_DURATION_MS, 70_000)).toEqual({
      remainingSeconds: 0,
      remainingPercent: 0,
    });
  });

  it('expires once after one minute', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    const onExpire = vi.fn();
    const onTick = vi.fn();

    startAutoDecisionCountdown({ onTick, onExpire });
    expect(onTick).toHaveBeenLastCalledWith({ remainingSeconds: 60, remainingPercent: 100 });

    vi.advanceTimersByTime(AUTO_DECISION_DURATION_MS);
    expect(onTick).toHaveBeenLastCalledWith({ remainingSeconds: 0, remainingPercent: 0 });
    expect(onExpire).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled before expiry', () => {
    vi.useFakeTimers();
    const onExpire = vi.fn();
    const cancel = startAutoDecisionCountdown({ onTick: () => undefined, onExpire });

    cancel();
    vi.advanceTimersByTime(AUTO_DECISION_DURATION_MS);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
