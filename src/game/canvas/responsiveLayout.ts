export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TubeLayout {
  centerX: number;
  centerY: number;
  visualWidth: number;
  visualHeight: number;
  hitRect: Rect;
}

export interface ResponsiveLayout {
  width: number;
  height: number;
  tubes: readonly TubeLayout[];
}

interface LayoutInput {
  width: number;
  height: number;
  tubeCount: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function computeResponsiveLayout(input: LayoutInput): ResponsiveLayout {
  const width = Math.max(280, input.width);
  const height = Math.max(228, input.height);
  const columns = input.tubeCount >= 7 ? 4 : 3;
  const rows = Math.ceil(input.tubeCount / columns);
  const paddingX = clamp(width * 0.04, 12, 20);
  const paddingY = clamp(height * 0.04, 10, 22);
  const cellWidth = (width - paddingX * 2) / columns;
  const cellHeight = (height - paddingY * 2) / rows;
  const visualWidth = clamp(Math.min(cellWidth * 0.54, cellHeight * 0.32), 44, 68);
  const visualHeight = clamp(Math.min(visualWidth * 3, cellHeight - 16), 124, 204);
  const hitWidth = Math.max(56, Math.min(cellWidth - 4, visualWidth + 18));
  const hitHeight = Math.max(72, Math.min(cellHeight - 4, visualHeight + 20));
  const rowCounts = [
    Math.min(columns, input.tubeCount),
    Math.max(0, input.tubeCount - columns),
  ];
  const tubes: TubeLayout[] = [];

  rowCounts.forEach((count, row) => {
    for (let column = 0; column < count; column += 1) {
      const rowOffset = (columns - count) * cellWidth / 2;
      const centerX = paddingX + rowOffset + cellWidth * (column + 0.5);
      const centerY = paddingY + cellHeight * (row + 0.5);
      tubes.push({
        centerX,
        centerY,
        visualWidth,
        visualHeight,
        hitRect: {
          x: centerX - hitWidth / 2,
          y: centerY - hitHeight / 2,
          width: hitWidth,
          height: hitHeight,
        },
      });
    }
  });

  return {
    width,
    height,
    tubes,
  };
}

export function hitTestTube(
  tubes: readonly TubeLayout[],
  x: number,
  y: number,
): number | null {
  const matches = tubes
    .map((tube, index) => ({ tube, index }))
    .filter(({ tube }) =>
      x >= tube.hitRect.x
      && x <= tube.hitRect.x + tube.hitRect.width
      && y >= tube.hitRect.y
      && y <= tube.hitRect.y + tube.hitRect.height)
    .sort((a, b) =>
      Math.hypot(x - a.tube.centerX, y - a.tube.centerY)
      - Math.hypot(x - b.tube.centerX, y - b.tube.centerY));

  return matches[0]?.index ?? null;
}
