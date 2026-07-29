import type { ColorId, LevelDefinition } from '../domain/types';

const P: ColorId = 'pink';
const Y: ColorId = 'yellow';
const M: ColorId = 'mint';
const B: ColorId = 'blue';
const V: ColorId = 'purple';
const O: ColorId = 'orange';

const levels: LevelDefinition[] = [
  { id: 1, tubes: [[P, Y, M, B], [Y, M, B, P], [M, B, P, Y], [B, P, Y, M], [], []] },
  { id: 2, tubes: [[P, Y, P, Y], [M, B, M, B], [Y, P, Y, P], [B, M, B, M], [], []] },
  { id: 3, tubes: [[P, Y, M, P], [Y, M, B, Y], [M, B, P, M], [B, P, Y, B], [], []] },
  { id: 4, tubes: [[P, Y, M, B], [Y, M, B, V], [M, B, V, P], [B, V, P, Y], [V, P, Y, M], [], []] },
  { id: 5, tubes: [[P, Y, P, M], [Y, M, B, Y], [M, B, V, M], [B, V, P, B], [V, P, V, Y], [], []] },
  { id: 6, tubes: [[P, Y, M, V], [Y, B, V, P], [M, V, P, B], [B, P, Y, M], [V, M, B, Y], [], []] },
  { id: 7, tubes: [[P, Y, M, B], [Y, M, B, V], [M, B, V, O], [B, V, O, P], [V, O, P, Y], [O, P, Y, M], [], []] },
  { id: 8, tubes: [[P, Y, B, O], [Y, M, V, P], [M, B, O, Y], [B, V, P, M], [V, O, Y, B], [O, P, M, V], [], []] },
];

for (const level of levels) {
  level.tubes.forEach(Object.freeze);
  Object.freeze(level.tubes);
  Object.freeze(level);
}

export const LEVELS: readonly LevelDefinition[] = Object.freeze(levels);
