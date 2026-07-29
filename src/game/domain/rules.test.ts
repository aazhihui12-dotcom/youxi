import { describe, expect, it } from 'vitest';

import {
  applyMove,
  cloneBoard,
  getPour,
  getValidTargets,
  isSolved,
} from './rules';
import type { BoardState } from './types';

describe('Water Sort rules', () => {
  it('clones all tubes without sharing tube arrays', () => {
    const board: BoardState = [['pink'], ['blue']];

    const copy = cloneBoard(board);
    copy[0]?.push('pink');

    expect(copy).toEqual([['pink', 'pink'], ['blue']]);
    expect(board).toEqual([['pink'], ['blue']]);
  });

  it('returns a pour into an empty tube', () => {
    expect(getPour([['pink'], []], 0, 1)).toEqual({
      from: 0,
      to: 1,
      amount: 1,
      color: 'pink',
    });
  });

  it('rejects a pour onto a differently colored tube', () => {
    expect(getPour([['pink'], ['blue']], 0, 1)).toBeNull();
  });

  it('pours the contiguous top-color group when space permits', () => {
    expect(getPour([['blue', 'pink', 'pink'], ['pink', 'pink']], 0, 1)?.amount).toBe(2);
  });

  it('limits a contiguous pour to the destination space', () => {
    expect(getPour([['blue', 'pink', 'pink'], ['pink', 'pink', 'pink']], 0, 1)?.amount).toBe(1);
  });

  it('rejects a pour into a full tube', () => {
    expect(getPour([['pink'], ['pink', 'pink', 'pink', 'pink']], 0, 1)).toBeNull();
  });

  it('rejects a pour into its own source tube', () => {
    expect(getPour([['pink'], []], 0, 0)).toBeNull();
  });

  it('applies a move without mutating the board', () => {
    const board: BoardState = [['blue', 'pink'], []];

    expect(applyMove(board, {
      from: 0,
      to: 1,
      amount: 1,
      color: 'pink',
    })).toEqual([['blue'], ['pink']]);
    expect(board).toEqual([['blue', 'pink'], []]);
  });

  it('rejects a partial pour without mutating the board', () => {
    const board: BoardState = [['pink', 'pink'], []];

    expect(() => applyMove(board, {
      from: 0,
      to: 1,
      amount: 1,
      color: 'pink',
    })).toThrow(RangeError);
    expect(board).toEqual([['pink', 'pink'], []]);
  });

  it('recognizes boards made of empty and full monochrome tubes as solved', () => {
    expect(isSolved([['pink', 'pink', 'pink', 'pink'], []])).toBe(true);
  });

  it('keeps a partially filled monochrome tube unsolved', () => {
    expect(isSolved([['pink', 'pink'], []])).toBe(false);
  });

  it('returns empty and matching-color tubes as valid targets', () => {
    expect(getValidTargets([['pink'], [], ['pink'], ['blue']], 0)).toEqual([1, 2]);
  });
});
