import type { QualityConfig, QualityLevel } from './adaptiveQuality';
import type { SceneRenderModel, TubeRenderModel } from './renderModel';
import type { TubeLayout } from './responsiveLayout';
import { TUBE_CAPACITY } from '../constants';
import type { ColorId } from '../domain/types';

export const COLOR_STOPS: Record<ColorId, readonly [string, string, string]> = {
  pink: ['#ff9bbb', '#ff6f9e', '#d94a7d'],
  yellow: ['#ffe28a', '#ffc84b', '#e6a72c'],
  mint: ['#90efd7', '#44d7b0', '#2aa889'],
  blue: ['#9fbdff', '#5e94ff', '#416fd1'],
  purple: ['#c8b6ff', '#9a78e8', '#7353bf'],
  orange: ['#ffc09a', '#ff925c', '#d96b3d'],
};

type BitmapCanvas = HTMLCanvasElement | OffscreenCanvas;

interface BottleCacheEntry {
  liquid?: BitmapCanvas;
  glass?: BitmapCanvas;
}

export interface PourRenderState {
  source: TubeRenderModel;
  target: TubeRenderModel;
  sourceLiquidUnits: number;
  targetLiquidUnits: number;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - safeRadius,
    y + height,
  );
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function createBitmapCanvas(
  cssWidth: number,
  cssHeight: number,
  pixelRatio: number,
): { canvas: BitmapCanvas; context: CanvasRenderingContext2D } {
  const width = Math.max(1, Math.round(cssWidth * pixelRatio));
  const height = Math.max(1, Math.round(cssHeight * pixelRatio));
  let canvas: BitmapCanvas;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(width, height);
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
  } else {
    throw new Error('Canvas bitmap creation is unavailable');
  }

  const context = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (context === null) {
    throw new Error('Canvas 2D context is unavailable');
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { canvas, context };
}

function cacheKey(
  tube: TubeRenderModel,
  qualityLevel: QualityLevel,
): string {
  const { visualWidth, visualHeight } = tube.layout;
  return [
    visualWidth,
    visualHeight,
    qualityLevel,
    tube.colors.join(','),
  ].join(':');
}

function drawCachedLiquid(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
): void {
  const { visualWidth: width, visualHeight: height } = tube.layout;
  const innerX = width * 0.17;
  const innerTop = height * 0.075;
  const innerWidth = width * 0.66;
  const innerBottom = height * 0.91;
  const layerHeight = (innerBottom - innerTop) / 4;

  context.save();
  roundedRectPath(
    context,
    innerX,
    innerTop,
    innerWidth,
    innerBottom - innerTop,
    width * 0.25,
  );
  context.clip();

  tube.colors.slice(0, 4).forEach((color, index) => {
    const top = innerBottom - (index + 1) * layerHeight;
    const halfWidth = innerWidth / 2;
    const [light, middle, dark] = COLOR_STOPS[color];
    const leftGradient = context.createLinearGradient(
      innerX,
      top,
      innerX + halfWidth,
      top,
    );
    leftGradient.addColorStop(0, light);
    leftGradient.addColorStop(1, middle);
    context.fillStyle = leftGradient;
    context.fillRect(innerX, top, halfWidth, layerHeight + 1);

    const rightGradient = context.createLinearGradient(
      innerX + halfWidth,
      top,
      innerX + innerWidth,
      top,
    );
    rightGradient.addColorStop(0, middle);
    rightGradient.addColorStop(1, dark);
    context.fillStyle = rightGradient;
    context.fillRect(
      innerX + halfWidth,
      top,
      halfWidth,
      layerHeight + 1,
    );

    context.beginPath();
    context.ellipse(
      innerX + innerWidth / 2,
      top,
      innerWidth / 2,
      Math.max(2, width * 0.055),
      0,
      0,
      Math.PI * 2,
    );
    context.fillStyle = light;
    context.fill();
  });

  context.restore();
}

function drawCachedGlass(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
  qualityLevel: QualityLevel,
): void {
  const { visualWidth: width, visualHeight: height } = tube.layout;
  const inset = Math.max(2, width * 0.045);
  const top = height * 0.045;
  const bodyHeight = height * 0.9;

  const glassGradient = context.createLinearGradient(0, 0, width, 0);
  glassGradient.addColorStop(0, 'rgba(255,255,255,0.72)');
  glassGradient.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  glassGradient.addColorStop(1, 'rgba(213,222,245,0.62)');
  roundedRectPath(
    context,
    inset,
    top,
    width - inset * 2,
    bodyHeight,
    width * 0.3,
  );
  context.lineWidth = Math.max(1.5, width * 0.04);
  context.strokeStyle = glassGradient;
  context.stroke();

  context.beginPath();
  context.moveTo(width * 0.29, height * 0.18);
  context.lineTo(width * 0.29, height * 0.72);
  context.lineWidth = Math.max(1, width * 0.025);
  context.strokeStyle = 'rgba(255,255,255,0.78)';
  context.stroke();

  context.beginPath();
  context.ellipse(
    width / 2,
    top + inset,
    width * 0.37,
    Math.max(2, width * 0.075),
    0,
    0,
    Math.PI * 2,
  );
  context.lineWidth = Math.max(1.5, width * 0.035);
  context.strokeStyle = 'rgba(255,255,255,0.82)';
  context.stroke();

  if (qualityLevel !== 'low') {
    context.beginPath();
    context.ellipse(
      width * 0.41,
      height * 0.13,
      width * 0.08,
      width * 0.035,
      -0.25,
      0,
      Math.PI * 2,
    );
    context.fillStyle = 'rgba(255,255,255,0.72)';
    context.fill();
  }
}

export class BottleBitmapCache {
  private readonly entries = new Map<string, BottleCacheEntry>();
  private pixelRatio = 1;
  private qualityLevel: QualityLevel = 'high';

  configure(pixelRatio: number, qualityLevel: QualityLevel): void {
    this.pixelRatio = pixelRatio;
    this.qualityLevel = qualityLevel;
  }

  clear(): void {
    this.entries.clear();
  }

  liquid(tube: TubeRenderModel): BitmapCanvas {
    const entry = this.entry(tube);
    if (entry.liquid === undefined) {
      const surface = createBitmapCanvas(
        tube.layout.visualWidth,
        tube.layout.visualHeight,
        this.pixelRatio,
      );
      drawCachedLiquid(surface.context, tube);
      entry.liquid = surface.canvas;
    }
    return entry.liquid;
  }

  glass(tube: TubeRenderModel): BitmapCanvas {
    const entry = this.entry(tube);
    if (entry.glass === undefined) {
      const surface = createBitmapCanvas(
        tube.layout.visualWidth,
        tube.layout.visualHeight,
        this.pixelRatio,
      );
      drawCachedGlass(surface.context, tube, this.qualityLevel);
      entry.glass = surface.canvas;
    }
    return entry.glass;
  }

  private entry(tube: TubeRenderModel): BottleCacheEntry {
    const key = cacheKey(tube, this.qualityLevel);
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = {};
      this.entries.set(key, entry);
    }
    return entry;
  }
}

function tubeTopLeft(layout: TubeLayout): { x: number; y: number } {
  return {
    x: layout.centerX - layout.visualWidth / 2,
    y: layout.centerY - layout.visualHeight / 2,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function topColorCount(
  colors: readonly ColorId[],
  color: ColorId,
): number {
  let count = 0;
  for (let index = colors.length - 1; index >= 0; index -= 1) {
    if (colors[index] !== color) break;
    count += 1;
  }
  return count;
}

export function buildPourRenderState(
  model: SceneRenderModel,
): PourRenderState | null {
  const pour = model.pour;
  if (pour === null || pour.from === pour.to) return null;
  const source = model.tubes[pour.from];
  const target = model.tubes[pour.to];
  if (source === undefined || target === undefined) return null;

  const amount = Math.min(
    topColorCount(source.colors, pour.color),
    Math.max(0, TUBE_CAPACITY - target.colors.length),
  );
  const progress = clamp(
    Number.isFinite(pour.liquidProgress) ? pour.liquidProgress : 0,
    0,
    1,
  );
  const movedColors = Array<ColorId>(amount).fill(pour.color);

  return {
    source,
    target: {
      ...target,
      colors: [...target.colors, ...movedColors],
    },
    sourceLiquidUnits: source.colors.length - amount * progress,
    targetLiquidUnits: target.colors.length + amount * progress,
  };
}

export function drawBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#f7f4ff');
  gradient.addColorStop(1, '#e9efff');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
}

export function drawTubeShadow(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
): void {
  const { layout } = tube;
  context.save();
  context.beginPath();
  context.ellipse(
    layout.centerX,
    layout.centerY + layout.visualHeight * 0.47,
    layout.visualWidth * 0.45,
    layout.visualWidth * 0.12,
    0,
    0,
    Math.PI * 2,
  );
  const shadow = context.createRadialGradient(
    layout.centerX,
    layout.centerY + layout.visualHeight * 0.47,
    0,
    layout.centerX,
    layout.centerY + layout.visualHeight * 0.47,
    layout.visualWidth * 0.45,
  );
  shadow.addColorStop(0, 'rgba(52,47,91,0.2)');
  shadow.addColorStop(1, 'rgba(52,47,91,0)');
  context.fillStyle = shadow;
  context.fill();
  context.restore();
}

export function drawLiquid(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
  cache: BottleBitmapCache,
  visibleUnits = tube.colors.length,
): void {
  const safeUnits = clamp(visibleUnits, 0, tube.colors.length);
  if (safeUnits === 0) return;
  const position = tubeTopLeft(tube.layout);
  const bitmap = cache.liquid(tube);
  if (safeUnits < tube.colors.length) {
    const { visualWidth: width, visualHeight: height } = tube.layout;
    const innerTop = height * 0.075;
    const innerBottom = height * 0.91;
    const layerHeight = (innerBottom - innerTop) / 4;
    const liquidTop = position.y + innerBottom - safeUnits * layerHeight;
    const liquidBottom = position.y + innerBottom;

    context.save();
    context.beginPath();
    context.rect(
      position.x,
      liquidTop,
      width,
      liquidBottom - liquidTop,
    );
    context.clip();
    context.drawImage(
      bitmap,
      position.x,
      position.y,
      width,
      height,
    );
    context.restore();

    if (!Number.isInteger(safeUnits)) {
      const surfaceColor = tube.colors[Math.ceil(safeUnits) - 1];
      if (surfaceColor !== undefined) {
        context.save();
        context.beginPath();
        context.ellipse(
          tube.layout.centerX,
          liquidTop,
          width * 0.33,
          Math.max(2, width * 0.055),
          0,
          0,
          Math.PI * 2,
        );
        context.fillStyle = COLOR_STOPS[surfaceColor][0];
        context.fill();
        context.restore();
      }
    }
    return;
  }

  context.drawImage(
    bitmap,
    position.x,
    position.y,
    tube.layout.visualWidth,
    tube.layout.visualHeight,
  );
}

export function drawGlass(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
  cache: BottleBitmapCache,
): void {
  const position = tubeTopLeft(tube.layout);
  context.drawImage(
    cache.glass(tube),
    position.x,
    position.y,
    tube.layout.visualWidth,
    tube.layout.visualHeight,
  );
}

export function drawTubeState(
  context: CanvasRenderingContext2D,
  tube: TubeRenderModel,
  quality: QualityConfig,
): void {
  const { layout } = tube;
  context.save();

  if (quality.glow && (tube.selected || tube.validTarget || tube.completed)) {
    context.shadowColor = tube.completed ? '#5fe0b9' : '#a884ff';
    context.shadowBlur = 12;
  }

  if (tube.selected) {
    const position = tubeTopLeft(layout);
    roundedRectPath(
      context,
      position.x - 4,
      position.y - 4,
      layout.visualWidth + 8,
      layout.visualHeight + 8,
      layout.visualWidth * 0.34,
    );
    context.lineWidth = 3;
    context.strokeStyle = '#8b67e8';
    context.stroke();
  }

  if (tube.validTarget) {
    context.beginPath();
    context.ellipse(
      layout.centerX,
      layout.centerY + layout.visualHeight * 0.52,
      layout.visualWidth * 0.48,
      layout.visualWidth * 0.12,
      0,
      0,
      Math.PI * 2,
    );
    context.lineWidth = 3;
    context.strokeStyle = '#44d7b0';
    context.stroke();
  }

  if (tube.completed) {
    context.beginPath();
    context.arc(
      layout.centerX + layout.visualWidth * 0.34,
      layout.centerY - layout.visualHeight * 0.4,
      Math.max(4, layout.visualWidth * 0.11),
      0,
      Math.PI * 2,
    );
    context.fillStyle = '#44d7b0';
    context.fill();
  }

  if (tube.pressed) {
    const position = tubeTopLeft(layout);
    roundedRectPath(
      context,
      position.x + 2,
      position.y + 2,
      layout.visualWidth - 4,
      layout.visualHeight - 4,
      layout.visualWidth * 0.28,
    );
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(67,56,103,0.4)';
    context.stroke();
  }

  context.restore();
}

export function drawPour(
  context: CanvasRenderingContext2D,
  model: SceneRenderModel,
  cache: BottleBitmapCache,
  renderState = buildPourRenderState(model),
): void {
  const pour = model.pour;
  if (pour === null || renderState === null) return;
  const { source, target } = renderState;

  const overlay: TubeRenderModel = {
    ...source,
    layout: {
      ...source.layout,
      centerX: 0,
      centerY: 0,
    },
    selected: false,
    validTarget: false,
    completed: false,
    pressed: false,
  };

  context.save();
  context.translate(pour.sourceX, pour.sourceY);
  context.rotate(pour.rotation);
  drawLiquid(context, overlay, cache, renderState.sourceLiquidUnits);
  drawGlass(context, overlay, cache);
  context.restore();

  if (pour.streamProgress > 0) {
    const lipLocalY = -source.layout.visualHeight / 2
      + source.layout.visualHeight * 0.045
      + Math.max(2, source.layout.visualWidth * 0.045);
    const streamStartX = pour.sourceX
      - lipLocalY * Math.sin(pour.rotation);
    const streamStartY = pour.sourceY
      + lipLocalY * Math.cos(pour.rotation);
    const streamEndY = target.layout.centerY - target.layout.visualHeight * 0.44;
    const streamGradient = context.createLinearGradient(
      streamStartX,
      streamStartY,
      target.layout.centerX,
      streamEndY,
    );
    const [light, middle, dark] = COLOR_STOPS[pour.color];
    streamGradient.addColorStop(0, light);
    streamGradient.addColorStop(0.55, middle);
    streamGradient.addColorStop(1, dark);
    context.save();
    if (model.quality.glow) {
      context.shadowColor = middle;
      context.shadowBlur = 8;
    }
    context.beginPath();
    context.moveTo(streamStartX, streamStartY);
    context.lineTo(
      target.layout.centerX,
      streamStartY + (streamEndY - streamStartY) * pour.streamProgress,
    );
    context.lineWidth = Math.max(4, target.layout.visualWidth * 0.09);
    context.lineCap = 'round';
    context.strokeStyle = streamGradient;
    context.stroke();
    context.restore();
  }

  if (pour.rippleProgress > 0) {
    context.save();
    context.beginPath();
    context.ellipse(
      target.layout.centerX,
      target.layout.centerY - target.layout.visualHeight * 0.39,
      target.layout.visualWidth * (0.12 + pour.rippleProgress * 0.2),
      target.layout.visualWidth * 0.05,
      0,
      0,
      Math.PI * 2,
    );
    context.globalAlpha = 1 - pour.rippleProgress;
    context.lineWidth = 2;
    context.strokeStyle = COLOR_STOPS[pour.color][0];
    context.stroke();
    context.restore();
  }
}
