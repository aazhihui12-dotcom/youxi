import { cloneBoard } from '../domain/rules';
import type { LevelDefinition } from '../domain/types';
import { LEVELS } from './levels';

export function getLevel(id: number): LevelDefinition {
  const clampedId = Math.min(LEVELS.length, Math.max(1, Math.trunc(id)));
  const level = LEVELS[clampedId - 1];

  if (level === undefined) {
    throw new RangeError('No levels are available');
  }

  return {
    id: level.id,
    tubes: cloneBoard(level.tubes),
  };
}
