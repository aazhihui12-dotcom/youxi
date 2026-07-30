import Phaser from 'phaser';

import { NoopAdAdapter, createSafeAds } from '../adapters/ads';
import { NoopAnalyticsAdapter, createSafeAnalytics } from '../adapters/analytics';
import { SoundController } from '../audio/SoundController';
import { GAME_HEIGHT, GAME_WIDTH, TUBE_CAPACITY } from '../constants';
import { applyMove, getValidTargets, isSolved } from '../domain/rules';
import type { Move, TubeState } from '../domain/types';
import { PointerOwnershipGate } from '../input/pointerOwnership';
import { LEVELS } from '../levels/levels';
import { getLevel } from '../levels/repository';
import {
  advanceElapsed,
  commitPendingMove,
  createGameState,
  restart,
  tapTube,
  undo,
  type GameState,
} from '../session/reducer';
import {
  loadProgress,
  saveProgress,
  type ProgressData,
  type StorageLike,
} from '../session/progress';
import { UIButton } from '../ui/UIButton';
import { JA } from '../ui/copy';
import { computeHudSafeAreaOffset } from '../ui/safeArea';
import { PourAnimator } from '../view/PourAnimator';
import { TubeView } from '../view/TubeView';
import { computeTubeLayout } from '../view/layout';
import { COLOR_STOPS } from '../view/palette';

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const TEXT_COLOR = '#514a69';
const CONFETTI_COLORS = [
  COLOR_STOPS.pink.middle,
  COLOR_STOPS.yellow.middle,
  COLOR_STOPS.mint.middle,
  COLOR_STOPS.blue.middle,
  COLOR_STOPS.purple.middle,
] as const;

interface ConfettiPiece {
  view: Phaser.GameObjects.Rectangle;
  velocityX: number;
  velocityY: number;
  gravity: number;
  rotationSpeed: number;
}

export class GameScene extends Phaser.Scene {
  private readonly analytics = createSafeAnalytics(new NoopAnalyticsAdapter());
  private readonly ads = createSafeAds(new NoopAdAdapter());
  private readonly storage: StorageLike = {
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
  };

  private state!: GameState;
  private progress!: ProgressData;
  private soundController!: SoundController;
  private pourAnimator!: PourAnimator;
  private levelText!: Phaser.GameObjects.Text;
  private undoButton!: UIButton;
  private soundButton!: UIButton;
  private restartButton!: UIButton;
  private tubeViews: TubeView[] = [];
  private clearOverlay: Phaser.GameObjects.Container | null = null;
  private confetti: ConfettiPiece[] = [];
  private pointerGate = new PointerOwnershipGate();
  private firstInteractionTracked = false;
  private interactionBusy = false;
  private overlayTransitioning = false;
  private levelActive = false;
  private shuttingDown = false;
  private levelEpoch = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.shuttingDown = false;
    this.pointerGate = new PointerOwnershipGate();
    this.drawBackground();

    this.progress = loadProgress(this.storage);
    this.soundController = new SoundController(this.progress.soundEnabled);
    this.pourAnimator = new PourAnimator(this, this.soundController);

    const hudY = 64 + this.getSafeAreaAllowance();
    this.undoButton = new UIButton(this, 64, hudY, '↶');
    this.bindOwnedAction(this.undoButton, () => this.handleUndo());

    this.levelText = this.add.text(GAME_WIDTH / 2, hudY, '', {
      color: TEXT_COLOR,
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.soundButton = new UIButton(
      this,
      476,
      hudY,
      this.soundController.enabled ? '♫' : '×',
    );
    this.bindOwnedAction(this.soundButton, () => this.handleSoundToggle());

    this.add.text(GAME_WIDTH / 2, 132, JA.title, {
      color: '#4d4664',
      fontFamily: FONT_FAMILY,
      fontSize: '36px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 180, JA.guide, {
      color: '#817994',
      fontFamily: FONT_FAMILY,
      fontSize: '18px',
    }).setOrigin(0.5);

    this.restartButton = new UIButton(this, GAME_WIDTH / 2, 892, '↻', 'violet');
    this.bindOwnedAction(this.restartButton, () => this.handleRestart());

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.handlePointerRelease, this);
    this.input.on(
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
      this.handlePointerRelease,
      this,
    );

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

    this.analytics.track('game_loaded', { level: this.progress.currentLevel });
    this.loadLevel(this.progress.currentLevel);
  }

  update(_time: number, delta: number): void {
    if (this.levelActive && this.clearOverlay === null) {
      this.state = advanceElapsed(this.state, delta);
    }

    this.updateConfetti(delta);
    this.syncSoundFailure();
  }

  private drawBackground(): void {
    const background = this.add.graphics();
    background.fillGradientStyle(
      0xfffaf2,
      0xfffaf2,
      0xf3efff,
      0xe9f7ff,
      1,
    );
    background.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const decoration = this.add.graphics();
    decoration.fillStyle(0xffffff, 0.24);
    decoration.fillCircle(63, 284, 122);
    decoration.fillCircle(494, 694, 154);
    this.drawBlossom(decoration, 444, 235, 31);
    this.drawBlossom(decoration, 92, 748, 38);
  }

  private drawBlossom(
    graphics: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    radius: number,
  ): void {
    graphics.fillStyle(0xffffff, 0.2);
    for (let index = 0; index < 5; index += 1) {
      const angle = Phaser.Math.DegToRad(-90 + index * 72);
      graphics.fillEllipse(
        centerX + Math.cos(angle) * radius * 0.55,
        centerY + Math.sin(angle) * radius * 0.55,
        radius,
        radius * 0.72,
      );
    }
    graphics.fillStyle(0xffffff, 0.28);
    graphics.fillCircle(centerX, centerY, radius * 0.2);
  }

  private loadLevel(levelId: number): void {
    const level = getLevel(levelId);

    this.levelEpoch += 1;
    this.overlayTransitioning = false;
    this.interactionBusy = false;
    this.destroyClearOverlay();
    this.clearConfetti();
    this.destroyTubeViews();

    this.state = createGameState(level);
    this.levelActive = true;
    this.createTubeViews(level.tubes.length);
    this.renderState();
    this.analytics.track('level_started', { level: level.id });
  }

  private createTubeViews(tubeCount: number): void {
    const layout = computeTubeLayout(GAME_WIDTH, GAME_HEIGHT, tubeCount);

    this.tubeViews = layout.positions.map(({ x, y }, index) => {
      const tube = new TubeView(this, x, y, layout.tubeWidth, layout.tubeHeight);
      tube.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, tube.width, tube.height),
        Phaser.Geom.Rectangle.Contains,
      );
      tube.setDepth(10);
      this.bindOwnedAction(tube, () => {
        void this.handleTubePointer(index);
      });
      return tube;
    });
  }

  private destroyTubeViews(): void {
    for (const tube of this.tubeViews) {
      if (tube.active) {
        tube.destroy();
      }
    }
    this.tubeViews = [];
  }

  private async handleTubePointer(index: number): Promise<void> {
    if (!this.canHandleGameplayInput()) return;

    const epoch = this.levelEpoch;
    this.interactionBusy = true;
    this.updateHud();
    this.trackFirstInteraction();

    try {
      const transition = tapTube(this.state, index);
      this.state = transition.state;

      switch (transition.effect.kind) {
        case 'selected':
          this.soundController.play('select');
          this.renderState();
          break;
        case 'deselected':
          this.renderState();
          break;
        case 'invalid': {
          this.soundController.play('invalid');
          const tube = this.tubeViews[transition.effect.tube];
          if (tube !== undefined && tube.active) {
            await tube.shake();
          }
          break;
        }
        case 'pour':
          await this.playAndCommitPour(transition.effect.move, epoch);
          break;
        case 'ignored':
          break;
      }
    } finally {
      if (!this.shuttingDown && epoch === this.levelEpoch) {
        this.interactionBusy = false;
        this.updateHud();
      }
    }
  }

  private async playAndCommitPour(move: Move, epoch: number): Promise<void> {
    try {
      const previewBoard = applyMove(this.state.board, move);
      const source = this.tubeViews[move.from];
      const target = this.tubeViews[move.to];

      if (source === undefined || target === undefined) {
        throw new Error('Move views are unavailable');
      }

      await this.pourAnimator.play(
        source,
        target,
        move,
        previewBoard[move.from]!,
        previewBoard[move.to]!,
      );
    } catch {
      // The reducer commit below is the recovery boundary for every animation failure.
    } finally {
      this.state = commitPendingMove(this.state);
      if (!this.shuttingDown && epoch === this.levelEpoch) {
        this.renderState();
      }
    }

    if (
      !this.shuttingDown
      && epoch === this.levelEpoch
      && isSolved(this.state.board)
    ) {
      this.runWinSequence();
    }
  }

  private renderState(): void {
    const validTargets = this.state.selectedTube === null
      ? new Set<number>()
      : new Set(getValidTargets(this.state.board, this.state.selectedTube));

    this.tubeViews.forEach((view, index) => {
      const tube = this.state.board[index] ?? [];
      view.setTube(tube);
      view.setSelected(index === this.state.selectedTube);
      view.setValidTarget(validTargets.has(index));
      view.setCompleted(this.isCompletedTube(tube));
    });

    this.updateHud();
  }

  private isCompletedTube(tube: TubeState): boolean {
    const firstColor = tube[0];
    return tube.length === TUBE_CAPACITY
      && firstColor !== undefined
      && tube.every((color) => color === firstColor);
  }

  private updateHud(): void {
    if (
      this.levelText === undefined
      || this.undoButton === undefined
      || this.restartButton === undefined
    ) {
      return;
    }

    const controlsAvailable = this.levelActive
      && this.clearOverlay === null
      && !this.interactionBusy
      && !this.state.inputLocked;

    this.levelText.setText(JA.level(this.state.levelId));
    this.undoButton.setEnabled(controlsAvailable && this.state.history.length > 0);
    this.restartButton.setEnabled(controlsAvailable);
    this.updateSoundButton();
  }

  private updateSoundButton(): void {
    if (this.soundButton !== undefined) {
      this.soundButton.setIcon(this.soundController.enabled ? '♫' : '×');
    }
  }

  private handleUndo(): void {
    if (!this.canHandleGameplayInput() || this.state.history.length === 0) return;

    this.analytics.track('undo_clicked', {
      level: this.state.levelId,
      moves: this.state.moveCount,
    });
    this.state = undo(this.state);
    this.renderState();
  }

  private handleRestart(): void {
    if (!this.canHandleGameplayInput()) return;

    this.analytics.track('restart_clicked', {
      level: this.state.levelId,
      moves: this.state.moveCount,
    });
    this.state = restart(this.state);
    this.renderState();
  }

  private handleSoundToggle(): void {
    const enabled = !this.soundController.enabled;
    this.soundController.setEnabled(enabled);
    this.progress = {
      ...this.progress,
      soundEnabled: enabled,
    };
    saveProgress(this.storage, this.progress);
    this.updateSoundButton();

    if (enabled) {
      this.soundController.play('select');
    }
  }

  private canHandleGameplayInput(): boolean {
    return !this.shuttingDown
      && this.levelActive
      && this.clearOverlay === null
      && !this.interactionBusy
      && !this.state.inputLocked;
  }

  private bindOwnedAction(
    target: Phaser.GameObjects.GameObject,
    action: () => void,
  ): void {
    target.on(
      Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN,
      (pointer: Phaser.Input.Pointer) => {
        this.pointerGate.beginAction(pointer.id, target);
      },
    );
    target.on(
      Phaser.Input.Events.GAMEOBJECT_POINTER_UP,
      (pointer: Phaser.Input.Pointer) => {
        if (
          !pointer.wasCanceled
          && this.pointerGate.canAct(pointer.id, target)
        ) {
          action();
        }
      },
    );
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    this.pointerGate.begin(pointer.id);
  }

  private handlePointerRelease(pointer: Phaser.Input.Pointer): void {
    this.pointerGate.release(pointer.id);
  }

  private trackFirstInteraction(): void {
    if (this.firstInteractionTracked) return;

    this.firstInteractionTracked = true;
    this.analytics.track('first_interaction', { level: this.state.levelId });
  }

  private runWinSequence(): void {
    if (!this.levelActive || this.clearOverlay !== null) return;

    this.levelActive = false;
    const elapsedSeconds = this.state.elapsedMs / 1_000;
    this.analytics.track('level_completed', {
      level: this.state.levelId,
      moves: this.state.moveCount,
      elapsedSeconds,
    });

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
      soundEnabled: this.soundController.enabled,
    };
    saveProgress(this.storage, this.progress);

    void this.ads.showInterstitial('level-complete');
    this.emitConfetti();
    this.soundController.play('success');
    this.cameras.main.shake(120, 0.002);
    this.showClearOverlay();
    this.updateHud();
  }

  private emitConfetti(): void {
    this.clearConfetti();

    for (let index = 0; index < 48; index += 1) {
      const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length]!;
      const width = Phaser.Math.Between(6, 12);
      const height = Phaser.Math.Between(10, 18);
      const view = this.add.rectangle(
        GAME_WIDTH / 2 + Phaser.Math.Between(-96, 96),
        230 + Phaser.Math.Between(-24, 24),
        width,
        height,
        color,
        0.96,
      );
      view.setDepth(80);
      view.setRotation(Phaser.Math.FloatBetween(-Math.PI, Math.PI));

      this.confetti.push({
        view,
        velocityX: Phaser.Math.FloatBetween(-0.18, 0.18),
        velocityY: Phaser.Math.FloatBetween(-0.42, -0.18),
        gravity: Phaser.Math.FloatBetween(0.00065, 0.001),
        rotationSpeed: Phaser.Math.FloatBetween(-0.006, 0.006),
      });
    }
  }

  private updateConfetti(delta: number): void {
    if (this.confetti.length === 0) return;

    const remaining: ConfettiPiece[] = [];
    for (const piece of this.confetti) {
      if (!piece.view.active) continue;

      piece.velocityY += piece.gravity * delta;
      piece.view.x += piece.velocityX * delta;
      piece.view.y += piece.velocityY * delta;
      piece.view.rotation += piece.rotationSpeed * delta;

      if (piece.view.y > GAME_HEIGHT + 36) {
        piece.view.destroy();
      } else {
        remaining.push(piece);
      }
    }
    this.confetti = remaining;
  }

  private clearConfetti(): void {
    for (const piece of this.confetti) {
      if (piece.view.active) {
        piece.view.destroy();
      }
    }
    this.confetti = [];
  }

  private showClearOverlay(): void {
    const overlay = this.add.container(0, 0).setDepth(100);
    const blocker = this.add.zone(0, 0, GAME_WIDTH, GAME_HEIGHT)
      .setOrigin(0)
      .setInteractive();
    const veil = this.add.graphics();
    veil.fillStyle(0xffffff, 0.32);
    veil.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    const panel = this.add.graphics();
    panel.fillStyle(0xffffff, 0.9);
    panel.fillRoundedRect(60, 265, 420, 440, 34);
    panel.lineStyle(2, 0xffffff, 0.95);
    panel.strokeRoundedRect(60, 265, 420, 440, 34);

    const clearText = this.add.text(GAME_WIDTH / 2, 338, JA.clear, {
      color: '#685c86',
      fontFamily: FONT_FAMILY,
      fontSize: '44px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const movesText = this.add.text(
      GAME_WIDTH / 2,
      425,
      `手数 ${this.state.moveCount}`,
      {
        color: TEXT_COLOR,
        fontFamily: FONT_FAMILY,
        fontSize: '23px',
        fontStyle: 'bold',
      },
    ).setOrigin(0.5);

    const elapsedText = this.add.text(
      GAME_WIDTH / 2,
      466,
      `タイム ${(this.state.elapsedMs / 1_000).toFixed(1)}秒`,
      {
        color: '#777086',
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
      },
    ).setOrigin(0.5);

    overlay.add([blocker, veil, panel, clearText, movesText, elapsedText]);

    if (this.state.levelId < LEVELS.length) {
      overlay.add(this.createOverlayButton(
        552,
        JA.nextLevel,
        0x9a78e8,
        () => this.handleNextLevel(),
      ));
      overlay.add(this.createOverlayButton(
        633,
        JA.playAgain,
        0xffffff,
        () => this.handleReplay(),
        '#685f7d',
      ));
    } else {
      overlay.add(this.createOverlayButton(
        595,
        JA.playAgain,
        0x9a78e8,
        () => this.handleReplay(),
      ));
    }

    this.clearOverlay = overlay;
  }

  private createOverlayButton(
    y: number,
    label: string,
    color: number,
    action: () => void,
    textColor = '#ffffff',
  ): Phaser.GameObjects.Container {
    const button = this.add.container(GAME_WIDTH / 2, y);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x4f4569, 0.14);
    shadow.fillRoundedRect(-151, -27, 302, 62, 28);

    const background = this.add.graphics();
    background.fillStyle(color, color === 0xffffff ? 0.94 : 1);
    background.fillRoundedRect(-150, -31, 300, 62, 28);
    background.lineStyle(2, 0xffffff, 0.72);
    background.strokeRoundedRect(-150, -31, 300, 62, 28);

    const text = this.add.text(0, -1, label, {
      color: textColor,
      fontFamily: FONT_FAMILY,
      fontSize: '22px',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    button.add([shadow, background, text]);
    button.setSize(300, 64);
    button.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, 300, 64),
      Phaser.Geom.Rectangle.Contains,
    );
    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, () => button.setScale(0.98));
    button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, () => button.setScale(1));
    this.bindOwnedAction(button, () => {
      button.setScale(1);
      action();
    });
    return button;
  }

  private handleNextLevel(): void {
    if (this.overlayTransitioning || this.clearOverlay === null) return;

    this.overlayTransitioning = true;
    const nextLevel = Math.min(LEVELS.length, this.state.levelId + 1);
    this.progress = {
      ...this.progress,
      currentLevel: nextLevel,
      soundEnabled: this.soundController.enabled,
    };
    saveProgress(this.storage, this.progress);
    this.loadLevel(nextLevel);
  }

  private handleReplay(): void {
    if (this.overlayTransitioning || this.clearOverlay === null) return;

    this.overlayTransitioning = true;
    this.loadLevel(this.state.levelId);
  }

  private destroyClearOverlay(): void {
    if (this.clearOverlay?.active) {
      this.clearOverlay.destroy(true);
    }
    this.clearOverlay = null;
  }

  private syncSoundFailure(): void {
    if (this.progress.soundEnabled && !this.soundController.enabled) {
      this.progress = {
        ...this.progress,
        soundEnabled: false,
      };
      saveProgress(this.storage, this.progress);
      this.updateSoundButton();
    }
  }

  private handleShutdown(): void {
    this.shuttingDown = true;
    this.levelActive = false;
    this.levelEpoch += 1;
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.handlePointerDown, this);
    this.input.off(Phaser.Input.Events.POINTER_UP, this.handlePointerRelease, this);
    this.input.off(
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
      this.handlePointerRelease,
      this,
    );
    this.clearConfetti();
    this.tubeViews = [];
    this.clearOverlay = null;
  }

  private getSafeAreaAllowance(): number {
    if (typeof document === 'undefined') return 0;

    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.top = '0';
    probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);

    try {
      const cssPixels = Number.parseFloat(getComputedStyle(probe).paddingTop) || 0;
      const canvasRect = this.game.canvas.getBoundingClientRect();
      return computeHudSafeAreaOffset({
        insetTopCss: cssPixels,
        canvasTopCss: canvasRect.top,
        canvasHeightCss: canvasRect.height || GAME_HEIGHT,
      });
    } finally {
      probe.remove();
    }
  }
}
