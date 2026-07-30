export type AnimationStep = (timeMs: number) => boolean;

export class RenderScheduler {
  private frameId: number | null = null;
  private step: AnimationStep | null = null;
  private resolveAnimation: (() => void) | null = null;

  constructor(
    private readonly render: () => void,
    private readonly requestFrame = requestAnimationFrame,
    private readonly cancelFrame = cancelAnimationFrame,
  ) {}

  get running(): boolean {
    return this.frameId !== null;
  }

  invalidate(): void {
    if (this.frameId !== null) return;
    this.frameId = this.requestFrame(this.onFrame);
  }

  animate(step: AnimationStep): Promise<void> {
    this.stop();
    this.step = step;
    const done = new Promise<void>((resolve) => {
      this.resolveAnimation = resolve;
    });
    this.invalidate();
    return done;
  }

  stop(): void {
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
    this.step = null;
    const resolve = this.resolveAnimation;
    this.resolveAnimation = null;
    resolve?.();
  }

  private readonly onFrame = (timeMs: number): void => {
    this.frameId = null;
    const keepRunning = this.step?.(timeMs) ?? false;
    this.render();
    if (keepRunning) {
      this.frameId = this.requestFrame(this.onFrame);
      return;
    }

    this.step = null;
    const resolve = this.resolveAnimation;
    this.resolveAnimation = null;
    resolve?.();
  };
}
