import { GAME_HEIGHT, GAME_WIDTH } from '../constants';

export interface TubePosition {
  x: number;
  y: number;
}

export interface TubeLayout {
  tubeWidth: number;
  tubeHeight: number;
  positions: TubePosition[];
}

const REFERENCE_TUBE_WIDTH = 60;
const REFERENCE_TUBE_HEIGHT = 184;
const REFERENCE_COLUMN_GAP = 114;
const REFERENCE_ROW_Y = [370, 610] as const;

export function computeTubeLayout(
  viewportWidth: number,
  viewportHeight: number,
  tubeCount: number,
): TubeLayout {
  const columns = tubeCount >= 7 ? 4 : 3;
  const rowCounts = [
    Math.min(columns, tubeCount),
    Math.max(0, tubeCount - columns),
  ];
  const scaleX = viewportWidth / GAME_WIDTH;
  const scaleY = viewportHeight / GAME_HEIGHT;
  const positions: TubePosition[] = [];

  rowCounts.forEach((count, rowIndex) => {
    const rowY = REFERENCE_ROW_Y[rowIndex];
    if (rowY === undefined) return;

    for (let columnIndex = 0; columnIndex < count; columnIndex += 1) {
      const offset = (columnIndex - (count - 1) / 2) * REFERENCE_COLUMN_GAP;
      positions.push({
        x: Math.round((GAME_WIDTH / 2 + offset) * scaleX),
        y: Math.round(rowY * scaleY),
      });
    }
  });

  return {
    tubeWidth: Math.round(REFERENCE_TUBE_WIDTH * scaleX),
    tubeHeight: Math.round(REFERENCE_TUBE_HEIGHT * scaleY),
    positions,
  };
}
