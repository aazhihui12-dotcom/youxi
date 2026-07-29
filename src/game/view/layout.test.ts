import { describe, expect, it } from 'vitest';

import { computeTubeLayout } from './layout';

describe('computeTubeLayout', () => {
  it('matches the six-tube reference layout at the logical game size', () => {
    expect(computeTubeLayout(540, 960, 6)).toEqual({
      tubeWidth: 60,
      tubeHeight: 184,
      positions: [
        { x: 156, y: 370 },
        { x: 270, y: 370 },
        { x: 384, y: 370 },
        { x: 156, y: 610 },
        { x: 270, y: 610 },
        { x: 384, y: 610 },
      ],
    });
  });

  it('keeps eight tubes within the compact two-row play area', () => {
    const eight = computeTubeLayout(360, 640, 8);

    expect(eight.positions).toHaveLength(8);
    expect(eight.positions.every(({ x }) => x >= 34 && x <= 326)).toBe(true);
    expect(eight.positions.every(({ y }) => y >= 210 && y <= 510)).toBe(true);
  });
});
