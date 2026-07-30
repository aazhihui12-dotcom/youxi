import {
  BottleBitmapCache,
  buildPourRenderState,
  drawBackground,
  drawGlass,
  drawLiquid,
  drawPour,
  drawTubeShadow,
  drawTubeState,
} from './drawBottle';
import type { SceneRenderModel } from './renderModel';

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
}

export class CanvasRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly cache = new BottleBitmapCache();
  private cssWidth = 0;
  private cssHeight = 0;
  private pixelRatio = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('Canvas 2D context is unavailable');
    }
    this.context = context;
  }

  resize(cssWidth: number, cssHeight: number, pixelRatio: number): void {
    assertPositiveFinite(cssWidth, 'cssWidth');
    assertPositiveFinite(cssHeight, 'cssHeight');
    assertPositiveFinite(pixelRatio, 'pixelRatio');

    const changed = cssWidth !== this.cssWidth
      || cssHeight !== this.cssHeight
      || pixelRatio !== this.pixelRatio;

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.pixelRatio = pixelRatio;
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.canvas.width = Math.round(cssWidth * pixelRatio);
    this.canvas.height = Math.round(cssHeight * pixelRatio);
    this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    this.cache.configure(pixelRatio, 'high');

    if (changed) this.cache.clear();
  }

  render(model: SceneRenderModel): void {
    this.cache.configure(this.pixelRatio, model.quality.level);
    const pourState = buildPourRenderState(model);
    const staticTubes = pourState === null
      ? model.tubes
      : model.tubes.filter(({ index }) => index !== model.pour?.from);
    this.context.clearRect(0, 0, this.cssWidth, this.cssHeight);
    drawBackground(this.context, this.cssWidth, this.cssHeight);
    for (const tube of staticTubes) drawTubeShadow(this.context, tube);
    for (const tube of staticTubes) {
      if (tube.index === model.pour?.to && pourState !== null) {
        drawLiquid(
          this.context,
          pourState.target,
          this.cache,
          pourState.targetLiquidUnits,
        );
      } else {
        drawLiquid(this.context, tube, this.cache);
      }
    }
    for (const tube of staticTubes) {
      drawGlass(
        this.context,
        tube.index === model.pour?.to && pourState !== null
          ? pourState.target
          : tube,
        this.cache,
      );
    }
    for (const tube of staticTubes) {
      drawTubeState(this.context, tube, model.quality);
    }
    if (pourState !== null) {
      drawPour(this.context, model, this.cache, pourState);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}
