import { describe, expect, it } from 'vitest';

import { buildPourTimeline } from './timeline';

describe('buildPourTimeline', () => {
  it('builds the fixed two-unit timeline for a pour to the right', () => {
    expect(buildPourTimeline(
      { x: 150, y: 420 },
      { x: 390, y: 420 },
      2,
    )).toEqual({
      liftMs: 140,
      travelMs: 260,
      tiltMs: 180,
      pourMs: 560,
      returnMs: 320,
      pourX: 342,
      pourY: 284,
      tiltRadians: 1.05,
    });
  });

  it('places and tilts the source on the opposite side for a target to the left', () => {
    expect(buildPourTimeline(
      { x: 390, y: 420 },
      { x: 150, y: 420 },
      1,
    )).toEqual({
      liftMs: 140,
      travelMs: 260,
      tiltMs: 180,
      pourMs: 420,
      returnMs: 320,
      pourX: 198,
      pourY: 284,
      tiltRadians: -1.05,
    });
  });
});
