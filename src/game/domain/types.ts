export type ColorId = 'pink' | 'yellow' | 'mint' | 'blue' | 'purple' | 'orange';

export type TubeState = ColorId[];
export type BoardState = TubeState[];

export interface Move {
  from: number;
  to: number;
  amount: number;
  color: ColorId;
}

export interface LevelDefinition {
  id: number;
  tubes: BoardState;
}
