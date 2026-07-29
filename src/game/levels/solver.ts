import { applyMove, getPour, isSolved } from '../domain/rules';
import type { BoardState } from '../domain/types';

interface SearchState {
  board: BoardState;
  depth: number;
}

function canonicalKey(board: BoardState): string {
  return board
    .map((tube) => tube.join(','))
    .sort()
    .join('|');
}

export function findMinimumMoves(board: BoardState, maxStates: number): number {
  if (isSolved(board)) return 0;

  const queue: SearchState[] = [{ board, depth: 0 }];
  const visited = new Set([canonicalKey(board)]);
  let queueIndex = 0;

  if (visited.size > maxStates) {
    throw new Error('Solver state limit exceeded');
  }

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;

    if (current === undefined) continue;

    for (let from = 0; from < current.board.length; from += 1) {
      for (let to = 0; to < current.board.length; to += 1) {
        const move = getPour(current.board, from, to);
        if (move === null) continue;

        const nextBoard = applyMove(current.board, move);
        const key = canonicalKey(nextBoard);
        if (visited.has(key)) continue;

        visited.add(key);
        if (visited.size > maxStates) {
          throw new Error('Solver state limit exceeded');
        }

        const depth = current.depth + 1;
        if (isSolved(nextBoard)) return depth;

        queue.push({ board: nextBoard, depth });
      }
    }
  }

  throw new Error('Puzzle is unsolvable');
}
