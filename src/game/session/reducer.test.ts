import { describe, expect, it } from 'vitest';

import type { LevelDefinition } from '../domain/types';
import {
  advanceElapsed,
  commitPendingMove,
  createGameState,
  restart,
  tapTube,
  undo,
} from './reducer';

const level: LevelDefinition = {
  id: 1,
  tubes: [['blue', 'pink'], ['pink'], [], []],
};

describe('game session reducer', () => {
  it('keeps the board unchanged until a pending pour is committed', () => {
    let state = createGameState(level);

    state = tapTube(state, 0).state;
    expect(state.selectedTube).toBe(0);

    const transition = tapTube(state, 1);
    expect(transition.effect).toEqual({
      kind: 'pour',
      move: { from: 0, to: 1, amount: 1, color: 'pink' },
    });
    expect(transition.state.inputLocked).toBe(true);
    expect(transition.state.pendingMove).toEqual({
      from: 0,
      to: 1,
      amount: 1,
      color: 'pink',
    });
    expect(transition.state.board).toEqual(level.tubes);

    const committed = commitPendingMove(transition.state);
    expect(committed.board).toEqual([['blue'], ['pink', 'pink'], [], []]);
    expect(committed.moveCount).toBe(1);
    expect(committed.history).toHaveLength(1);
  });

  it('ignores tube taps while a pour is pending', () => {
    const selected = tapTube(createGameState(level), 0).state;
    const pending = tapTube(selected, 1).state;

    const transition = tapTube(pending, 2);

    expect(transition.effect.kind).toBe('ignored');
    expect(transition.state).toBe(pending);
  });

  it('deselects a selected tube when it is tapped again', () => {
    const selected = tapTube(createGameState(level), 0).state;

    const transition = tapTube(selected, 0);

    expect(transition.effect).toEqual({ kind: 'deselected', tube: 0 });
    expect(transition.state.selectedTube).toBeNull();
  });

  it('rejects an empty tube as a source', () => {
    const state = createGameState(level);

    const transition = tapTube(state, 2);

    expect(transition.effect).toEqual({ kind: 'invalid', tube: 2 });
    expect(transition.state).toBe(state);
  });

  it('keeps the source selected when the destination is illegal', () => {
    const mismatchedLevel: LevelDefinition = {
      id: 2,
      tubes: [['blue', 'pink'], ['blue'], [], []],
    };
    const selected = tapTube(createGameState(mismatchedLevel), 0).state;

    const transition = tapTube(selected, 1);

    expect(transition.effect).toEqual({ kind: 'invalid', tube: 1 });
    expect(transition.state).toBe(selected);
  });

  it('advances time only by a non-negative finite delta', () => {
    const state = createGameState(level);
    const advanced = advanceElapsed(state, 250);

    expect(advanced.elapsedMs).toBe(250);
    expect(advanceElapsed(advanced, -1)).toBe(advanced);
    expect(advanceElapsed(advanced, Number.POSITIVE_INFINITY)).toBe(advanced);
    expect(advanceElapsed(advanced, Number.NaN)).toBe(advanced);
  });

  it('undoes the latest committed move without rewinding elapsed time', () => {
    const selected = tapTube(createGameState(level), 0).state;
    const pending = tapTube(selected, 1).state;
    const committed = advanceElapsed(commitPendingMove(pending), 250);

    const undone = undo(committed);

    expect(undone.board).toEqual(level.tubes);
    expect(undone.moveCount).toBe(0);
    expect(undone.history).toEqual([]);
    expect(undone.elapsedMs).toBe(250);
  });

  it('disables undo while input is locked', () => {
    const selected = tapTube(createGameState(level), 0).state;
    const pending = tapTube(selected, 1).state;

    expect(undo(pending)).toBe(pending);
  });

  it('restarts from an isolated clone of the initial board', () => {
    const selected = tapTube(createGameState(level), 0).state;
    const committed = advanceElapsed(commitPendingMove(tapTube(selected, 1).state), 250);

    const restarted = restart(committed);
    restarted.board[0]?.push('blue');

    expect(restarted.moveCount).toBe(0);
    expect(restarted.history).toEqual([]);
    expect(restarted.elapsedMs).toBe(0);
    expect(restarted.selectedTube).toBeNull();
    expect(restarted.pendingMove).toBeNull();
    expect(restarted.inputLocked).toBe(false);
    expect(restarted.initialBoard).toEqual(level.tubes);
  });
});
