import type { SoundController } from '../audio/SoundController';
import type { AdaptiveQuality } from '../canvas/adaptiveQuality';
import type { CanvasRenderer } from '../canvas/CanvasRenderer';
import { samplePourFrame } from '../canvas/pourAnimation';
import {
  buildSceneRenderModel,
  type SceneRenderModel,
} from '../canvas/renderModel';
import type { RenderScheduler } from '../canvas/renderScheduler';
import {
  computeResponsiveLayout,
  hitTestTube as hitTestLayoutTube,
  type ResponsiveLayout,
} from '../canvas/responsiveLayout';
import { getValidTargets, isSolved } from '../domain/rules';
import type { Move } from '../domain/types';
import type { PointerController } from '../input/PointerController';
import { LEVELS } from '../levels/levels';
import { getLevel } from '../levels/repository';
import {
  advanceElapsed,
  commitPendingMove,
  createGameState,
  restart as restartState,
  tapTube as reduceTapTube,
  undo as undoState,
  type GameState,
} from '../session/reducer';
import {
  loadProgress,
  saveProgress,
  type ProgressData,
  type StorageLike,
} from '../session/progress';
import type { DomShell } from './domShell';

export interface GameAppPorts {
  shell: DomShell;
  renderer: CanvasRenderer;
  scheduler: RenderScheduler;
  pointer: PointerController;
  quality: AdaptiveQuality;
  sound: SoundController;
  storage: StorageLike;
  now: () => number;
}

const DEFAULT_PROGRESS: ProgressData = {
  version: 1,
  currentLevel: 1,
  bestMoves: {},
  soundEnabled: true,
};

export class GameApp {
  private readonly shell: DomShell;
  private readonly renderer: CanvasRenderer;
  private readonly scheduler: RenderScheduler;
  private readonly pointer: PointerController;
  private readonly quality: AdaptiveQuality;
  private readonly sound: SoundController;
  private readonly storage: StorageLike;
  private readonly now: () => number;
  private state: GameState = createGameState(getLevel(1));
  private progress: ProgressData = DEFAULT_PROGRESS;
  private layout: ResponsiveLayout | null = null;
  private pressedTube: number | null = null;
  private pour: SceneRenderModel['pour'] = null;
  private paused = false;
  private destroyed = false;
  private animationToken = 0;
  private lastElapsedSample = 0;
  private cleared = false;
  private shakeTube: number | null = null;
  private shakeOffset = 0;

  constructor(ports: GameAppPorts) {
    this.shell = ports.shell;
    this.renderer = ports.renderer;
    this.scheduler = ports.scheduler;
    this.pointer = ports.pointer;
    this.quality = ports.quality;
    this.sound = ports.sound;
    this.storage = ports.storage;
    this.now = ports.now;
  }

  start(): void {
    if (this.destroyed) return;

    this.progress = loadProgress(this.storage);
    this.state = createGameState(getLevel(this.progress.currentLevel));
    this.cleared = false;
    this.lastElapsedSample = this.now();
    this.sound.setEnabled(this.progress.soundEnabled);
    this.shell.hideClear();
    this.shell.setGuideVisible(true);
    this.recomputeLayout();
    this.syncShell();
    this.scheduler.invalidate();
  }

  render(): void {
    if (this.layout === null || this.destroyed) return;

    const validTargets = this.state.selectedTube === null
      ? new Set<number>()
      : new Set(getValidTargets(this.state.board, this.state.selectedTube));
    const layout = this.shakeTube === null
      ? this.layout
      : {
          ...this.layout,
          tubes: this.layout.tubes.map((tube, index) => (
            index === this.shakeTube
              ? { ...tube, centerX: tube.centerX + this.shakeOffset }
              : tube
          )),
        };

    this.renderer.render(buildSceneRenderModel({
      board: this.state.board,
      selectedTube: this.state.selectedTube,
      validTargets,
      pressedTube: this.pressedTube,
      layout,
      quality: this.quality.config,
      pour: this.pour,
    }));
  }

  hitTestTube(x: number, y: number): number | null {
    if (this.layout === null) return null;
    return hitTestLayoutTube(this.layout.tubes, x, y);
  }

  setPressedTube(index: number | null): void {
    if (this.destroyed) return;
    this.pressedTube = index;
    this.scheduler.invalidate();
  }

  async tapTube(index: number): Promise<void> {
    if (this.destroyed || this.paused || this.cleared) return;
    this.syncElapsed();
    const transition = reduceTapTube(this.state, index);
    this.state = transition.state;
    this.syncControls();

    if (transition.effect.kind === 'selected') {
      this.sound.play('select');
      this.shell.setGuideVisible(false);
      this.scheduler.invalidate();
      return;
    }
    if (transition.effect.kind === 'deselected') {
      this.scheduler.invalidate();
      return;
    }
    if (transition.effect.kind === 'invalid') {
      this.sound.play('invalid');
      this.playInvalidShake(transition.effect.tube);
      return;
    }
    if (transition.effect.kind !== 'pour') return;

    await this.playAndCommitPour(transition.effect.move);
  }

  undo(): void {
    if (this.destroyed || this.paused || this.cleared) return;
    this.syncElapsed();
    this.state = undoState(this.state);
    this.syncControls();
    this.scheduler.invalidate();
  }

  restart(): void {
    if (this.destroyed) return;
    this.animationToken += 1;
    this.scheduler.stop();
    this.pointer.reset();
    this.clearTransientAnimation();
    this.state = restartState(this.state);
    this.cleared = false;
    this.lastElapsedSample = this.now();
    this.shell.hideClear();
    this.shell.setGuideVisible(true);
    this.syncControls();
    if (!this.paused) this.scheduler.invalidate();
  }

  toggleSound(): void {
    if (this.destroyed) return;
    const enabled = !this.sound.enabled;
    this.sound.setEnabled(enabled);
    this.progress = { ...this.progress, soundEnabled: enabled };
    saveProgress(this.storage, this.progress);
    this.shell.setSoundEnabled(enabled);
  }

  nextLevel(): void {
    if (this.destroyed) return;
    const level = Math.min(LEVELS.length, this.state.levelId + 1);
    this.progress = {
      ...this.progress,
      currentLevel: level,
      soundEnabled: this.sound.enabled,
    };
    saveProgress(this.storage, this.progress);
    this.replaceLevel(level);
  }

  replay(): void {
    if (this.destroyed) return;
    this.replaceLevel(this.state.levelId);
  }

  resize(input: { width: number; height: number }): void {
    if (
      this.destroyed
      || !Number.isFinite(input.width)
      || !Number.isFinite(input.height)
      || input.width <= 0
      || input.height <= 0
    ) {
      return;
    }

    this.animationToken += 1;
    this.scheduler.stop();
    this.pointer.reset();
    if (this.state.pendingMove !== null) {
      this.syncElapsed();
      this.state = commitPendingMove(this.state);
    }
    this.clearTransientAnimation();
    this.layout = computeResponsiveLayout({
      width: input.width,
      height: input.height,
      tubeCount: this.state.board.length,
    });
    this.renderer.resize(
      input.width,
      input.height,
      this.quality.config.maxPixelRatio,
    );
    this.renderer.clearCache();
    this.syncControls();
    if (!this.paused) this.scheduler.invalidate();
  }

  pause(): void {
    if (this.paused || this.destroyed) return;
    this.syncElapsed();
    this.paused = true;
    this.animationToken += 1;
    this.scheduler.stop();
    this.pointer.reset();
    this.pressedTube = null;
    this.syncControls();
  }

  resume(): void {
    if (!this.paused || this.destroyed) return;
    this.lastElapsedSample = this.now();
    this.paused = false;
    this.syncControls();
    this.scheduler.invalidate();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.animationToken += 1;
    this.scheduler.stop();
    this.pointer.reset();
    this.clearTransientAnimation();
    this.syncControls();
    await this.sound.dispose();
  }

  private syncElapsed(): void {
    if (this.paused) return;
    const current = this.now();
    const delta = Math.max(0, current - this.lastElapsedSample);
    this.lastElapsedSample = current;
    this.state = advanceElapsed(this.state, delta);
  }

  private async playAndCommitPour(move: Move): Promise<void> {
    const token = ++this.animationToken;
    const sourceLayout = this.layout?.tubes[move.from];
    const targetLayout = this.layout?.tubes[move.to];
    const source = {
      x: sourceLayout?.centerX ?? 0,
      y: sourceLayout?.centerY ?? 0,
    };
    const target = {
      x: targetLayout?.centerX ?? 0,
      y: targetLayout?.centerY ?? 0,
    };
    let animationStart: number | null = null;
    let previousTime: number | null = null;

    this.shakeTube = null;
    this.shakeOffset = 0;
    this.pointer.setBusy(true);
    this.sound.play('pour');
    this.syncControls();

    try {
      await this.scheduler.animate((timeMs) => {
        if (
          token !== this.animationToken
          || this.paused
          || this.destroyed
        ) {
          return false;
        }

        if (animationStart === null) animationStart = timeMs;
        if (previousTime !== null && timeMs > previousTime) {
          this.observeAnimationFrame(timeMs - previousTime);
        }
        previousTime = timeMs;

        const frame = samplePourFrame({
          source,
          target,
          amount: move.amount,
          elapsedMs: timeMs - animationStart,
        });
        this.pour = {
          ...frame,
          from: move.from,
          to: move.to,
          color: move.color,
        };
        return !frame.done;
      });
    } catch {
      // The reducer commit below is the recovery boundary for animation failures.
    } finally {
      this.syncElapsed();
      this.state = commitPendingMove(this.state);
      this.pour = null;
      this.pointer.setBusy(false);
      this.syncControls();
      if (!this.destroyed && !this.paused) this.scheduler.invalidate();
    }

    if (
      token !== this.animationToken
      || this.paused
      || this.destroyed
    ) {
      return;
    }

    if (isSolved(this.state.board)) {
      this.finishLevel();
      return;
    }

    const queuedTap = this.pointer.takeQueuedTap();
    if (queuedTap !== null) await this.tapTube(queuedTap);
  }

  private observeAnimationFrame(deltaMs: number): void {
    const previousLevel = this.quality.config.level;
    const config = this.quality.observeFrame(deltaMs) ?? this.quality.config;
    if (config.level === previousLevel || this.layout === null) return;

    this.renderer.resize(
      this.layout.width,
      this.layout.height,
      config.maxPixelRatio,
    );
  }

  private playInvalidShake(tube: number): void {
    const token = ++this.animationToken;
    let animationStart: number | null = null;
    this.shakeTube = tube;

    void this.scheduler.animate((timeMs) => {
      if (
        token !== this.animationToken
        || this.paused
        || this.destroyed
      ) {
        return false;
      }

      if (animationStart === null) animationStart = timeMs;
      const progress = Math.min(1, (timeMs - animationStart) / 180);
      this.shakeOffset = Math.sin(progress * Math.PI * 4)
        * (1 - progress)
        * 7;
      return progress < 1;
    }).finally(() => {
      if (token !== this.animationToken) return;
      this.shakeTube = null;
      this.shakeOffset = 0;
      if (!this.destroyed && !this.paused) this.scheduler.invalidate();
    });
  }

  private finishLevel(): void {
    if (this.cleared) return;
    this.cleared = true;
    const levelKey = String(this.state.levelId);
    const previousBest = this.progress.bestMoves[levelKey];
    const bestMoves = previousBest === undefined
      ? this.state.moveCount
      : Math.min(previousBest, this.state.moveCount);
    this.progress = {
      ...this.progress,
      bestMoves: {
        ...this.progress.bestMoves,
        [levelKey]: bestMoves,
      },
      soundEnabled: this.sound.enabled,
    };
    saveProgress(this.storage, this.progress);
    this.sound.play('success');
    this.shell.setGuideVisible(false);
    this.shell.showClear({
      moves: this.state.moveCount,
      elapsedSeconds: this.state.elapsedMs / 1_000,
      hasNext: this.state.levelId < LEVELS.length,
    });
    this.syncControls();
  }

  private replaceLevel(levelId: number): void {
    this.animationToken += 1;
    this.scheduler.stop();
    this.pointer.reset();
    this.clearTransientAnimation();
    this.state = createGameState(getLevel(levelId));
    this.cleared = false;
    this.lastElapsedSample = this.now();
    this.recomputeLayout();
    this.shell.hideClear();
    this.shell.setGuideVisible(true);
    this.syncShell();
    if (!this.paused) this.scheduler.invalidate();
  }

  private recomputeLayout(): void {
    if (this.layout === null) return;
    this.layout = computeResponsiveLayout({
      width: this.layout.width,
      height: this.layout.height,
      tubeCount: this.state.board.length,
    });
  }

  private clearTransientAnimation(): void {
    this.pour = null;
    this.pressedTube = null;
    this.shakeTube = null;
    this.shakeOffset = 0;
  }

  private syncShell(): void {
    this.shell.setLevel(this.state.levelId);
    this.shell.setSoundEnabled(this.progress.soundEnabled);
    this.syncControls();
  }

  private syncControls(): void {
    const active = !this.destroyed && !this.paused && !this.cleared;
    this.shell.setControlsEnabled({
      undo: active
        && !this.state.inputLocked
        && this.state.history.length > 0,
      restart: active && !this.state.inputLocked,
      sound: active,
    });
  }
}
