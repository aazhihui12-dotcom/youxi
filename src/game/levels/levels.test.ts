import { describe, expect, it } from 'vitest';

import { isSolved } from '../domain/rules';
import { LEVELS } from './levels';
import { getLevel } from './repository';
import { findMinimumMoves } from './solver';

describe('Water Sort levels', () => {
  it('provides eight unsolved boards with the expected tube counts', () => {
    expect(LEVELS).toHaveLength(8);
    expect(LEVELS.map((level) => level.tubes.length)).toEqual([6, 6, 6, 7, 7, 7, 8, 8]);

    for (const level of LEVELS) {
      const counts = new Map<string, number>();
      level.tubes.flat().forEach((color) => counts.set(color, (counts.get(color) ?? 0) + 1));

      expect([...counts.values()].every((count) => count === 4)).toBe(true);
      expect(level.tubes.every((tube) => tube.length <= 4)).toBe(true);
      expect(isSolved(level.tubes)).toBe(false);
    }
  });

  it('keeps every level solvable at its exact minimum move count', () => {
    expect(LEVELS.map((level) => findMinimumMoves(level.tubes, 100_000))).toEqual([
      13, 14, 13, 16, 17, 17, 19, 19,
    ]);
  });

  it('clamps level ids to the available range', () => {
    expect(getLevel(0).id).toBe(1);
    expect(getLevel(99).id).toBe(8);
  });

  it('returns a fresh board that cannot mutate repository level data', () => {
    const level = getLevel(1);
    level.tubes[0]?.push('pink');

    expect(getLevel(1).tubes[0]).toEqual(['pink', 'yellow', 'mint', 'blue']);
  });
});
