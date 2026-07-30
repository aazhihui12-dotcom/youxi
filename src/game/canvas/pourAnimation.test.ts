import { describe, expect, it } from 'vitest';
import { buildPourTimeline, samplePourFrame } from './pourAnimation';

describe('buildPourTimeline', () => {
  it.each([
    [1, 720],
    [2, 770],
    [3, 820],
    [4, 870],
  ])('keeps amount %s within the mobile budget', (amount, totalMs) => {
    expect(buildPourTimeline(amount)).toMatchObject({ totalMs });
    expect(totalMs).toBeGreaterThanOrEqual(700);
    expect(totalMs).toBeLessThanOrEqual(900);
  });

  it('returns the source to its origin on the final frame', () => {
    const timeline = buildPourTimeline(4);
    const frame = samplePourFrame({
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 4,
      elapsedMs: timeline.totalMs,
    });

    expect(frame).toMatchObject({
      sourceX: 40,
      sourceY: 300,
      rotation: 0,
      streamProgress: 0,
      liquidProgress: 1,
      done: true,
    });
  });

  it('runs the ripple in parallel with the return phase', () => {
    const timeline = buildPourTimeline(1);
    const frame = samplePourFrame({
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 1,
      elapsedMs: timeline.totalMs - 60,
    });

    expect(frame.rippleProgress).toBeGreaterThan(0);
    expect(frame.sourceX).toBeLessThan(240);
  });
});
