import Phaser from 'phaser';

import type { SoundController } from '../audio/SoundController';
import type { Move, TubeState } from '../domain/types';
import { COLOR_STOPS } from './palette';
import { buildPourTimeline } from './timeline';
import type { TubeView } from './TubeView';

const LIFT_DISTANCE = 32;
const STREAM_WIDTH = 12;
const LANDING_Y_OFFSET = 76;
const RIPPLE_MS = 200;

export class PourAnimator {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sound?: SoundController,
  ) {}

  async play(
    source: TubeView,
    target: TubeView,
    move: Move,
    sourceFinal: TubeState,
    targetFinal: TubeState,
  ): Promise<void> {
    const start = {
      x: source.x,
      y: source.y,
      rotation: source.rotation,
    };
    const timeline = buildPourTimeline(start, target, move.amount);
    const abortController = new AbortController();
    let stream: Phaser.GameObjects.Graphics | null = null;
    let ripple: Phaser.GameObjects.Graphics | null = null;

    const abort = (): void => {
      if (!abortController.signal.aborted) {
        abortController.abort(new Error('Pour animation interrupted'));
      }
    };

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, abort);
    source.once(Phaser.GameObjects.Events.DESTROY, abort);
    target.once(Phaser.GameObjects.Events.DESTROY, abort);

    try {
      this.ensureActive(source, target);

      await this.tween({
        targets: source,
        y: start.y - LIFT_DISTANCE,
        duration: timeline.liftMs,
        ease: 'Sine.easeOut',
      }, abortController.signal);

      await this.tween({
        targets: source,
        x: timeline.pourX,
        y: timeline.pourY,
        duration: timeline.travelMs,
        ease: 'Sine.easeInOut',
      }, abortController.signal);

      await this.tween({
        targets: source,
        rotation: timeline.tiltRadians,
        duration: timeline.tiltMs,
        ease: 'Sine.easeInOut',
      }, abortController.signal);

      source.setTube(sourceFinal);
      stream = this.createStream(target, timeline.pourY, move);
      this.sound?.play('pour');
      await this.animatePour(
        stream,
        target,
        targetFinal,
        move.amount,
        timeline.pourMs,
        abortController.signal,
      );

      ripple = this.createRipple(target, move);
      await this.tween({
        targets: ripple,
        scaleX: 1.55,
        scaleY: 1.55,
        alpha: 0,
        duration: RIPPLE_MS,
        ease: 'Sine.easeOut',
      }, abortController.signal);
      this.destroyTransient(ripple);
      ripple = null;

      this.destroyTransient(stream);
      stream = null;

      await this.tween({
        targets: source,
        x: start.x,
        y: start.y,
        rotation: start.rotation,
        duration: timeline.returnMs,
        ease: 'Sine.easeInOut',
      }, abortController.signal);

      source.setTube(sourceFinal);
      target.setTube(targetFinal);
    } finally {
      this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, abort);
      source.off(Phaser.GameObjects.Events.DESTROY, abort);
      target.off(Phaser.GameObjects.Events.DESTROY, abort);
      this.destroyTransient(stream);
      this.destroyTransient(ripple);
      source.setPosition(start.x, start.y);
      source.setRotation(start.rotation);
    }
  }

  private animatePour(
    stream: Phaser.GameObjects.Graphics,
    target: TubeView,
    targetFinal: TubeState,
    amount: number,
    duration: number,
    signal: AbortSignal,
  ): Promise<void> {
    const initialLength = Math.max(0, targetFinal.length - amount);
    const progress = { value: 0 };
    let revealed = 0;

    target.setTube(targetFinal.slice(0, initialLength));

    return this.tween({
      targets: progress,
      value: 1,
      duration,
      ease: 'Linear',
    }, signal, () => {
      stream.setScale(1, Math.min(1, progress.value * 4));
      const nextRevealed = Math.min(amount, Math.floor(progress.value * amount));
      if (nextRevealed > revealed) {
        revealed = nextRevealed;
        target.setTube(targetFinal.slice(0, initialLength + revealed));
      }
    }).then(() => {
      stream.setScale(1, 1);
      target.setTube(targetFinal);
    });
  }

  private createStream(
    target: TubeView,
    pourY: number,
    move: Move,
  ): Phaser.GameObjects.Graphics {
    const landingY = target.y - LANDING_Y_OFFSET;
    const streamHeight = Math.max(18, landingY - pourY);
    const color = COLOR_STOPS[move.color];
    const stream = this.scene.add.graphics({ x: target.x, y: pourY });

    stream.fillStyle(color.middle, 0.94);
    stream.fillRoundedRect(
      -STREAM_WIDTH / 2,
      0,
      STREAM_WIDTH,
      streamHeight,
      STREAM_WIDTH / 2,
    );
    stream.lineStyle(2, color.top, 0.58);
    stream.lineBetween(-STREAM_WIDTH / 4, 4, -STREAM_WIDTH / 4, streamHeight - 4);
    stream.setScale(1, 0);
    stream.setDepth(Math.max(sourceDepth(target), target.depth + 1));
    return stream;
  }

  private createRipple(
    target: TubeView,
    move: Move,
  ): Phaser.GameObjects.Graphics {
    const color = COLOR_STOPS[move.color];
    const ripple = this.scene.add.graphics({
      x: target.x,
      y: target.y - LANDING_Y_OFFSET,
    });

    ripple.lineStyle(4, color.top, 0.78);
    ripple.strokeEllipse(0, 0, 34, 10);
    ripple.setScale(0.5);
    ripple.setDepth(target.depth + 2);
    return ripple;
  }

  private tween(
    config: Phaser.Types.Tweens.TweenBuilderConfig,
    signal: AbortSignal,
    update?: () => void,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let tween: Phaser.Tweens.Tween | null = null;

      const finish = (error?: unknown): void => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        if (error === undefined) {
          resolve();
        } else {
          reject(error);
        }
      };
      const onAbort = (): void => {
        tween?.stop();
        finish(signal.reason);
      };
      if (signal.aborted) {
        finish(signal.reason);
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
      try {
        tween = this.scene.tweens.add({
          ...config,
          onUpdate: update === undefined
            ? undefined
            : () => {
              try {
                update();
              } catch (error) {
                finish(error);
                tween?.stop();
              }
            },
          onComplete: () => finish(),
          onStop: () => finish(signal.aborted
            ? signal.reason
            : new Error('Pour tween stopped')),
        });
      } catch (error) {
        finish(error);
      }
    });
  }

  private ensureActive(source: TubeView, target: TubeView): void {
    if (!source.active || !target.active || !this.scene.sys.isActive()) {
      throw new Error('Cannot animate destroyed tube views');
    }
  }

  private destroyTransient(graphics: Phaser.GameObjects.Graphics | null): void {
    if (graphics?.active) {
      graphics.destroy();
    }
  }
}

function sourceDepth(target: TubeView): number {
  return target.parentContainer?.depth ?? target.depth;
}
