import { GAME_HEIGHT } from '../constants';

const HUD_BASE_Y = 64;
const HUD_HALF_HEIGHT = 32;
const TITLE_REGION_TOP = 108;
const MAX_HUD_OFFSET = TITLE_REGION_TOP - HUD_BASE_Y - HUD_HALF_HEIGHT;

export interface SafeAreaMetrics {
  insetTopCss: number;
  canvasTopCss: number;
  canvasHeightCss: number;
}

export function computeHudSafeAreaOffset({
  insetTopCss,
  canvasTopCss,
  canvasHeightCss,
}: SafeAreaMetrics): number {
  if (
    !Number.isFinite(insetTopCss)
    || !Number.isFinite(canvasTopCss)
    || !Number.isFinite(canvasHeightCss)
    || canvasHeightCss <= 0
  ) {
    return 0;
  }

  const overlappingInset = Math.max(0, insetTopCss - canvasTopCss);
  const logicalOffset = overlappingInset * GAME_HEIGHT / canvasHeightCss;
  return Math.round(Math.min(MAX_HUD_OFFSET, logicalOffset));
}
