import { applyMove, cloneBoard, getPour } from '../domain/rules';
import type { BoardState, LevelDefinition, Move } from '../domain/types';

export interface GameState {
  levelId: number;
  initialBoard: BoardState;
  board: BoardState;
  selectedTube: number | null;
  pendingMove: Move | null;
  history: BoardState[];
  moveCount: number;
  elapsedMs: number;
  inputLocked: boolean;
}

export type GameEffect =
  | { kind: 'selected'; tube: number }
  | { kind: 'deselected'; tube: number }
  | { kind: 'invalid'; tube: number }
  | { kind: 'pour'; move: Move }
  | { kind: 'ignored' };

export interface GameTransition {
  state: GameState;
  effect: GameEffect;
}

export function createGameState(level: LevelDefinition): GameState {
  return {
    levelId: level.id,
    initialBoard: cloneBoard(level.tubes),
    board: cloneBoard(level.tubes),
    selectedTube: null,
    pendingMove: null,
    history: [],
    moveCount: 0,
    elapsedMs: 0,
    inputLocked: false,
  };
}

export function tapTube(state: GameState, tube: number): GameTransition {
  if (state.inputLocked) {
    return { state, effect: { kind: 'ignored' } };
  }

  if (state.selectedTube === null) {
    if (!Number.isInteger(tube) || tube < 0 || tube >= state.board.length || state.board[tube]?.length === 0) {
      return { state, effect: { kind: 'invalid', tube } };
    }

    return {
      state: { ...state, selectedTube: tube },
      effect: { kind: 'selected', tube },
    };
  }

  if (state.selectedTube === tube) {
    return {
      state: { ...state, selectedTube: null },
      effect: { kind: 'deselected', tube },
    };
  }

  const move = getPour(state.board, state.selectedTube, tube);
  if (move === null) {
    return { state, effect: { kind: 'invalid', tube } };
  }

  return {
    state: {
      ...state,
      selectedTube: null,
      pendingMove: move,
      inputLocked: true,
    },
    effect: { kind: 'pour', move },
  };
}

export function commitPendingMove(state: GameState): GameState {
  if (state.pendingMove === null) return state;

  const previousBoard = cloneBoard(state.board);
  return {
    ...state,
    board: applyMove(state.board, state.pendingMove),
    selectedTube: null,
    pendingMove: null,
    history: [...state.history, previousBoard],
    moveCount: state.moveCount + 1,
    inputLocked: false,
  };
}

export function advanceElapsed(state: GameState, deltaMs: number): GameState {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return state;
  return { ...state, elapsedMs: state.elapsedMs + deltaMs };
}

export function undo(state: GameState): GameState {
  const previousBoard = state.history[state.history.length - 1];
  if (state.inputLocked || previousBoard === undefined) return state;

  return {
    ...state,
    board: cloneBoard(previousBoard),
    selectedTube: null,
    pendingMove: null,
    history: state.history.slice(0, -1),
    moveCount: Math.max(0, state.moveCount - 1),
    inputLocked: false,
  };
}

export function restart(state: GameState): GameState {
  return {
    ...state,
    board: cloneBoard(state.initialBoard),
    selectedTube: null,
    pendingMove: null,
    history: [],
    moveCount: 0,
    elapsedMs: 0,
    inputLocked: false,
  };
}
