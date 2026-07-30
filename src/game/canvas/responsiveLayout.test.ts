import { describe, expect, it } from 'vitest';
import { computeResponsiveLayout, hitTestTube } from './responsiveLayout';

describe('computeResponsiveLayout', () => {
  it.each([
    [296, 330, 6],
    [336, 400, 6],
    [336, 500, 7],
    [366, 540, 8],
    [406, 600, 8],
  ])('fits %sx%s with %s tubes', (width, height, tubeCount) => {
    const layout = computeResponsiveLayout({
      width,
      height,
      tubeCount,
    });

    expect(layout.width).toBe(width);
    expect(layout.height).toBe(height);
    expect(layout.tubes).toHaveLength(tubeCount);

    for (const tube of layout.tubes) {
      expect(tube.visualWidth).toBeGreaterThanOrEqual(44);
      expect(tube.hitRect.width).toBeGreaterThanOrEqual(56);
      expect(tube.hitRect.height).toBeGreaterThanOrEqual(72);
      expect(tube.hitRect.x).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.y).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.x + tube.hitRect.width).toBeLessThanOrEqual(width);
      expect(tube.hitRect.y + tube.hitRect.height).toBeLessThanOrEqual(height);
    }

    for (const left of layout.tubes) {
      for (const right of layout.tubes) {
        if (right.centerX <= left.centerX || right.centerY !== left.centerY) continue;
        expect(right.hitRect.x - (left.hitRect.x + left.hitRect.width))
          .toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('fits a short landscape board without changing coordinate space', () => {
    const layout = computeResponsiveLayout({
      width: 480,
      height: 300,
      tubeCount: 8,
    });

    expect(layout.width).toBe(480);
    expect(layout.height).toBe(300);
    expect(layout.tubes.every((tube) =>
      tube.centerX >= 0 && tube.centerX <= 480)).toBe(true);
  });

  it('keeps hit areas inside a sub-228px landscape Canvas', () => {
    const width = 480;
    const height = 200;
    const layout = computeResponsiveLayout({
      width,
      height,
      tubeCount: 8,
    });

    expect(layout.width).toBe(width);
    expect(layout.height).toBe(height);
    for (const tube of layout.tubes) {
      expect(tube.hitRect.x).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.y).toBeGreaterThanOrEqual(0);
      expect(tube.hitRect.x + tube.hitRect.width).toBeLessThanOrEqual(width);
      expect(tube.hitRect.y + tube.hitRect.height).toBeLessThanOrEqual(height);
    }
  });

  it('returns the nearest containing tube hit area', () => {
    const layout = computeResponsiveLayout({
      width: 366,
      height: 540,
      tubeCount: 8,
    });
    const tube = layout.tubes[3]!;

    expect(hitTestTube(layout.tubes, tube.centerX, tube.centerY)).toBe(3);
    expect(hitTestTube(layout.tubes, -20, -20)).toBeNull();
  });
});
