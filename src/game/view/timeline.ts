export interface Point {
  x: number;
  y: number;
}

export interface PourTimeline {
  liftMs: number;
  travelMs: number;
  tiltMs: number;
  pourMs: number;
  returnMs: number;
  pourX: number;
  pourY: number;
  tiltRadians: number;
}

export function buildPourTimeline(
  source: Point,
  target: Point,
  amount: number,
): PourTimeline {
  const direction = target.x >= source.x ? 1 : -1;

  return {
    liftMs: 140,
    travelMs: 260,
    tiltMs: 180,
    pourMs: 420 + Math.max(0, amount - 1) * 140,
    returnMs: 320,
    pourX: target.x - direction * 48,
    pourY: target.y - 136,
    tiltRadians: direction * 1.05,
  };
}
