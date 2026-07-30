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

  it.each([
    [1.6, 770],
    [0, 720],
    [5, 870],
    [Number.NaN, 720],
    [Number.POSITIVE_INFINITY, 720],
    [Number.NEGATIVE_INFINITY, 720],
  ])('normalizes amount %s to a valid timeline', (amount, totalMs) => {
    expect(buildPourTimeline(amount).totalMs).toBe(totalMs);
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

  it('clamps elapsed time to the animation bounds', () => {
    const input = {
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 2,
    };
    const timeline = buildPourTimeline(input.amount);

    expect(samplePourFrame({ ...input, elapsedMs: -10 })).toEqual(
      samplePourFrame({ ...input, elapsedMs: 0 }),
    );
    expect(samplePourFrame({ ...input, elapsedMs: timeline.totalMs + 10 })).toEqual(
      samplePourFrame({ ...input, elapsedMs: timeline.totalMs }),
    );
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'uses the initial finite frame for invalid elapsed time %s',
    (elapsedMs) => {
      const input = {
        source: { x: 40, y: 300 },
        target: { x: 240, y: 300 },
        amount: 2,
      };
      const frame = samplePourFrame({ ...input, elapsedMs });

      expect(frame).toEqual(samplePourFrame({ ...input, elapsedMs: 0 }));
      expect(
        Object.values(frame)
          .filter((value): value is number => typeof value === 'number')
          .every(Number.isFinite),
      ).toBe(true);
    },
  );

  it('keeps the source position continuous at phase boundaries', () => {
    const input = {
      source: { x: 40, y: 300 },
      target: { x: 240, y: 300 },
      amount: 1,
    };
    const timeline = buildPourTimeline(input.amount);
    const boundaries = [
      timeline.liftMs,
      timeline.liftMs + timeline.travelMs,
      timeline.liftMs + timeline.travelMs + timeline.tiltMs,
      timeline.totalMs - timeline.returnMs,
    ];

    for (const boundary of boundaries) {
      const before = samplePourFrame({ ...input, elapsedMs: boundary - 0.001 });
      const at = samplePourFrame({ ...input, elapsedMs: boundary });
      const after = samplePourFrame({ ...input, elapsedMs: boundary + 0.001 });

      expect(at.sourceX).toBeCloseTo(before.sourceX, 3);
      expect(at.sourceY).toBeCloseTo(before.sourceY, 3);
      expect(after.sourceX).toBeCloseTo(at.sourceX, 3);
      expect(after.sourceY).toBeCloseTo(at.sourceY, 3);
    }
  });

  it('travels and tilts leftward when the target is left of the source', () => {
    const input = {
      source: { x: 240, y: 300 },
      target: { x: 40, y: 300 },
      amount: 1,
    };
    const timeline = buildPourTimeline(input.amount);
    const travelFrame = samplePourFrame({
      ...input,
      elapsedMs: timeline.liftMs + timeline.travelMs / 2,
    });
    const pourFrame = samplePourFrame({
      ...input,
      elapsedMs: timeline.liftMs + timeline.travelMs + timeline.tiltMs + 1,
    });

    expect(travelFrame.sourceX).toBeLessThan(input.source.x);
    expect(pourFrame.rotation).toBeLessThan(0);
  });
});
