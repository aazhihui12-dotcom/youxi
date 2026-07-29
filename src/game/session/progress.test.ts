import { describe, expect, it } from 'vitest';

import {
  loadProgress,
  saveProgress,
  type StorageLike,
} from './progress';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const defaults = {
  version: 1,
  currentLevel: 1,
  bestMoves: {},
  soundEnabled: true,
} as const;

describe('progress persistence', () => {
  it('returns defaults when no saved progress exists', () => {
    expect(loadProgress(new MemoryStorage())).toEqual(defaults);
  });

  it('returns defaults for malformed JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem('water-sort-progress', '{not-json');

    expect(loadProgress(storage)).toEqual(defaults);
  });

  it('round-trips valid progress', () => {
    const storage = new MemoryStorage();

    saveProgress(storage, {
      version: 1,
      currentLevel: 3,
      bestMoves: { '2': 14 },
      soundEnabled: false,
    });

    expect(loadProgress(storage)).toEqual({
      version: 1,
      currentLevel: 3,
      bestMoves: { '2': 14 },
      soundEnabled: false,
    });
  });

  it.each([
    { version: 2, currentLevel: 1, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: Number.NaN, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: Number.POSITIVE_INFINITY, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: 1.5, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: 0, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: 9, bestMoves: {}, soundEnabled: true },
    { version: 1, currentLevel: 1, bestMoves: {}, soundEnabled: 'yes' },
    { version: 1, currentLevel: 1, bestMoves: null, soundEnabled: true },
    { version: 1, currentLevel: 1, bestMoves: { '1': 0 }, soundEnabled: true },
    { version: 1, currentLevel: 1, bestMoves: { '1': 1.5 }, soundEnabled: true },
  ])('resets the complete object when a field is invalid: %#', (value) => {
    const storage = new MemoryStorage();
    storage.setItem('water-sort-progress', JSON.stringify(value));

    expect(loadProgress(storage)).toEqual(defaults);
  });

  it('catches unavailable storage and quota errors', () => {
    const unavailable: StorageLike = {
      getItem: () => {
        throw new Error('unavailable');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };

    expect(loadProgress(unavailable)).toEqual(defaults);
    expect(() => saveProgress(unavailable, {
      version: 1,
      currentLevel: 1,
      bestMoves: {},
      soundEnabled: true,
    })).not.toThrow();
  });
});
