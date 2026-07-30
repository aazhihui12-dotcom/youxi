import { describe, expect, it } from 'vitest';

import type { GameEffect } from '../session/reducer';
import { nextGuideVisibility } from './guideVisibility';

describe('nextGuideVisibility', () => {
  it.each<GameEffect>([
    { kind: 'invalid', tube: 2 },
    { kind: 'ignored' },
  ])('keeps the guide visible after an ineffective $kind interaction', (effect) => {
    expect(nextGuideVisibility(true, effect)).toBe(true);
  });

  it.each<GameEffect>([
    { kind: 'selected', tube: 0 },
    { kind: 'deselected', tube: 0 },
    {
      kind: 'pour',
      move: { from: 0, to: 1, amount: 1, color: 'pink' },
    },
  ])('hides the guide after the first effective $kind interaction', (effect) => {
    expect(nextGuideVisibility(true, effect)).toBe(false);
  });

  it('keeps the guide hidden after later invalid interactions', () => {
    expect(nextGuideVisibility(false, { kind: 'invalid', tube: 2 })).toBe(false);
  });
});
