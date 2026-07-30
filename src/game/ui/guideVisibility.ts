import type { GameEffect } from '../session/reducer';

export function nextGuideVisibility(
  currentlyVisible: boolean,
  effect: GameEffect,
): boolean {
  if (!currentlyVisible) return false;

  return effect.kind === 'invalid' || effect.kind === 'ignored';
}
