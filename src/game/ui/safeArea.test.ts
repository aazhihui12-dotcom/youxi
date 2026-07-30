import { describe, expect, it } from 'vitest';

import { computeHudSafeAreaOffset } from './safeArea';

describe('computeHudSafeAreaOffset', () => {
  it('adds no offset when a tall letterboxed canvas starts below the inset', () => {
    expect(computeHudSafeAreaOffset({
      insetTopCss: 59,
      canvasTopCss: 83.78,
      canvasHeightCss: 764.44,
    })).toBe(0);
  });

  it('scales only the part of the top inset overlapping the canvas', () => {
    expect(computeHudSafeAreaOffset({
      insetTopCss: 55,
      canvasTopCss: 50,
      canvasHeightCss: 800,
    })).toBe(6);
  });

  it('caps the HUD offset before its bottom enters the title region', () => {
    expect(computeHudSafeAreaOffset({
      insetTopCss: 80,
      canvasTopCss: 40,
      canvasHeightCss: 800,
    })).toBe(12);
  });
});
