export const AUTO_DECISION_DURATION_MS = 60_000;

export interface CountdownSnapshot {
  remainingSeconds: number;
  remainingPercent: number;
}

interface CountdownOptions {
  durationMs?: number;
  onTick: (snapshot: CountdownSnapshot) => void;
  onExpire: () => void;
}

export function countdownSnapshot(deadline: number, durationMs: number, now = Date.now()): CountdownSnapshot {
  const remainingMs = Math.max(0, deadline - now);
  return {
    remainingSeconds: Math.ceil(remainingMs / 1_000),
    remainingPercent: durationMs > 0 ? (remainingMs / durationMs) * 100 : 0,
  };
}

export function startAutoDecisionCountdown({
  durationMs = AUTO_DECISION_DURATION_MS,
  onTick,
  onExpire,
}: CountdownOptions): () => void {
  const deadline = Date.now() + durationMs;
  let interval: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const tick = (): void => {
    if (stopped) return;
    const snapshot = countdownSnapshot(deadline, durationMs);
    onTick(snapshot);
    if (snapshot.remainingSeconds === 0) {
      stopped = true;
      if (interval) clearInterval(interval);
      onExpire();
    }
  };

  tick();
  if (!stopped) interval = setInterval(tick, 250);

  return () => {
    stopped = true;
    if (interval) clearInterval(interval);
  };
}
