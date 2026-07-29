import { TUBE_CAPACITY } from '../constants';
import type { BoardState, Move } from './types';

export function cloneBoard(board: BoardState): BoardState {
  return board.map((tube) => [...tube]);
}

export function getPour(
  board: BoardState,
  from: number,
  to: number,
  capacity = TUBE_CAPACITY,
): Move | null {
  const source = board[from];
  const destination = board[to];

  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    to < 0 ||
    from >= board.length ||
    to >= board.length ||
    from === to ||
    source === undefined ||
    destination === undefined ||
    source.length === 0 ||
    destination.length >= capacity
  ) {
    return null;
  }

  const color = source[source.length - 1];
  if (color === undefined) return null;

  const destinationTop = destination[destination.length - 1];
  if (destinationTop !== undefined && destinationTop !== color) return null;

  let contiguousCount = 0;
  for (let index = source.length - 1; index >= 0 && source[index] === color; index -= 1) {
    contiguousCount += 1;
  }

  return {
    from,
    to,
    amount: Math.min(contiguousCount, capacity - destination.length),
    color,
  };
}

export function applyMove(
  board: BoardState,
  move: Move,
  capacity = TUBE_CAPACITY,
): BoardState {
  const source = board[move.from];
  const destination = board[move.to];
  const sourceSuffix = source?.slice(-move.amount);
  const destinationTop = destination?.[destination.length - 1];

  if (
    !Number.isInteger(move.from) ||
    !Number.isInteger(move.to) ||
    !Number.isInteger(move.amount) ||
    move.from < 0 ||
    move.to < 0 ||
    move.from >= board.length ||
    move.to >= board.length ||
    move.from === move.to ||
    move.amount <= 0 ||
    source === undefined ||
    destination === undefined ||
    move.amount > source.length ||
    destination.length + move.amount > capacity ||
    sourceSuffix === undefined ||
    sourceSuffix.length !== move.amount ||
    !sourceSuffix.every((color) => color === move.color) ||
    (destinationTop !== undefined && destinationTop !== move.color)
  ) {
    throw new RangeError('Invalid move');
  }

  const nextBoard = cloneBoard(board);
  const nextSource = nextBoard[move.from];
  const nextDestination = nextBoard[move.to];

  if (nextSource === undefined || nextDestination === undefined) {
    throw new RangeError('Invalid move');
  }

  nextDestination.push(...nextSource.splice(-move.amount, move.amount));
  return nextBoard;
}

export function getValidTargets(
  board: BoardState,
  from: number,
  capacity = TUBE_CAPACITY,
): number[] {
  return board.flatMap((_, to) => getPour(board, from, to, capacity) === null ? [] : [to]);
}

export function isSolved(board: BoardState, capacity = TUBE_CAPACITY): boolean {
  return board.every((tube) => {
    const firstColor = tube[0];
    return tube.length === 0 ||
      (tube.length === capacity && firstColor !== undefined && tube.every((color) => color === firstColor));
  });
}
