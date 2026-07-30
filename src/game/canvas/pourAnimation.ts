export interface Point {
  x: number;
  y: number;
}

export interface PourTimeline {
  liftMs: 100;
  travelMs: 150;
  tiltMs: 100;
  pourMs: number;
  returnMs: 120;
  totalMs: number;
}

export interface PourFrame {
  sourceX: number;
  sourceY: number;
  rotation: number;
  streamProgress: number;
  liquidProgress: number;
  rippleProgress: number;
  done: boolean;
}

export interface PourFrameInput {
  source: Point;
  target: Point;
  amount: number;
  elapsedMs: number;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const ease = (value: number): number =>
  0.5 - Math.cos(Math.PI * clamp01(value)) / 2;

export function buildPourTimeline(amount: number): PourTimeline {
  const safeAmount = Math.min(
    4,
    Math.max(1, Math.round(Number.isFinite(amount) ? amount : 1)),
  );
  const pourMs = 250 + (safeAmount - 1) * 50;

  return {
    liftMs: 100,
    travelMs: 150,
    tiltMs: 100,
    pourMs,
    returnMs: 120,
    totalMs: 100 + 150 + 100 + pourMs + 120,
  };
}

export function samplePourFrame(input: PourFrameInput): PourFrame {
  const timeline = buildPourTimeline(input.amount);
  const direction = input.target.x >= input.source.x ? 1 : -1;
  const pourPoint = {
    x: input.target.x - direction * 40,
    y: input.target.y - 118,
  };
  const liftEnd = timeline.liftMs;
  const travelEnd = liftEnd + timeline.travelMs;
  const tiltEnd = travelEnd + timeline.tiltMs;
  const pourEnd = tiltEnd + timeline.pourMs;
  const safeElapsed = Number.isFinite(input.elapsedMs) ? input.elapsedMs : 0;
  const elapsed = Math.min(timeline.totalMs, Math.max(0, safeElapsed));
  let sourceX = input.source.x;
  let sourceY = input.source.y;
  let rotation = 0;
  let streamProgress = 0;
  let liquidProgress = 0;

  if (elapsed <= liftEnd) {
    sourceY -= 28 * ease(elapsed / timeline.liftMs);
  } else if (elapsed <= travelEnd) {
    const progress = ease((elapsed - liftEnd) / timeline.travelMs);
    sourceX += (pourPoint.x - input.source.x) * progress;
    sourceY = input.source.y - 28 + (pourPoint.y - (input.source.y - 28)) * progress;
  } else if (elapsed <= tiltEnd) {
    const progress = ease((elapsed - travelEnd) / timeline.tiltMs);
    sourceX = pourPoint.x;
    sourceY = pourPoint.y;
    rotation = direction * 1.02 * progress;
  } else if (elapsed <= pourEnd) {
    const progress = clamp01((elapsed - tiltEnd) / timeline.pourMs);
    sourceX = pourPoint.x;
    sourceY = pourPoint.y;
    rotation = direction * 1.02;
    streamProgress = Math.min(1, progress * 4, (1 - progress) * 4);
    liquidProgress = progress;
  } else {
    const progress = ease((elapsed - pourEnd) / timeline.returnMs);
    sourceX = pourPoint.x + (input.source.x - pourPoint.x) * progress;
    sourceY = pourPoint.y + (input.source.y - pourPoint.y) * progress;
    rotation = direction * 1.02 * (1 - progress);
    liquidProgress = 1;
  }

  const rippleProgress = clamp01(
    (elapsed - (pourEnd - 80)) / (timeline.returnMs + 80),
  );

  return {
    sourceX,
    sourceY,
    rotation,
    streamProgress,
    liquidProgress,
    rippleProgress,
    done: elapsed >= timeline.totalMs,
  };
}
