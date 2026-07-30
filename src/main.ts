import './styles.css';
import { GameApp } from './game/app/GameApp';
import { createDomShell } from './game/app/domShell';
import { SoundController } from './game/audio/SoundController';
import { AdaptiveQuality } from './game/canvas/adaptiveQuality';
import { CanvasRenderer } from './game/canvas/CanvasRenderer';
import { RenderScheduler } from './game/canvas/renderScheduler';
import {
  PointerController,
  type PointerResult,
} from './game/input/PointerController';
import type { StorageLike } from './game/session/progress';

function getStorage(window: Window): StorageLike {
  try {
    return window.localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => undefined,
    };
  }
}

function releasePointer(canvas: HTMLCanvasElement, pointerId: number): void {
  try {
    canvas.releasePointerCapture?.(pointerId);
  } catch {
    // Losing capture during navigation or cancellation is harmless.
  }
}

export async function startGame(input: {
  document: Document;
  window: Window;
  parent: HTMLElement;
}): Promise<() => Promise<void>> {
  const { document, window, parent } = input;
  const shell = createDomShell(document, parent);
  const removers: Array<() => void> = [];
  let app: GameApp | null = null;
  let sound: SoundController | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let cleanupPromise: Promise<void> | null = null;

  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };
  const handleRetry = (): void => window.location.reload();
  const enableFatalRetry = (): void => {
    shell.retryButton.addEventListener('click', handleRetry, { once: true });
  };
  const cleanup = (): Promise<void> => {
    if (cleanupPromise === null) {
      cleanupPromise = (async () => {
        try {
          resizeObserver?.disconnect();
        } catch {
          // Cleanup continues even if a browser observer implementation fails.
        }
        resizeObserver = null;
        for (const remove of removers.reverse()) {
          try {
            remove();
          } catch {
            // One broken event target must not strand the remaining resources.
          }
        }

        const currentApp = app;
        const currentSound = sound;
        app = null;
        sound = null;
        if (currentApp !== null) {
          await currentApp.destroy();
        } else if (currentSound !== null) {
          await currentSound.dispose();
        }
      })();
    }

    return cleanupPromise;
  };

  const initialize = (): void => {
    listen(shell.retryButton, 'click', handleRetry);

    const quality = new AdaptiveQuality(window.devicePixelRatio);
    const renderer = new CanvasRenderer(shell.canvas);
    const scheduler = new RenderScheduler(() => app?.render());
    const activeSound = new SoundController();
    sound = activeSound;
    const pointer = new PointerController(
      (x, y) => app?.hitTestTube(x, y) ?? null,
    );
    let pointerOwner: number | null = null;
    let fallbackOwner: number | null = null;
    let handlePointerUp: EventListener;
    let handlePointerCancel: EventListener;
    const removePointerFallback = (pointerId?: number): void => {
      if (
        fallbackOwner === null
        || (pointerId !== undefined && fallbackOwner !== pointerId)
      ) {
        return;
      }
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerCancel);
      fallbackOwner = null;
    };
    const installPointerFallback = (pointerId: number): void => {
      removePointerFallback();
      fallbackOwner = pointerId;
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
    };
    removers.push(removePointerFallback);
    app = new GameApp({
      shell,
      renderer,
      scheduler,
      pointer,
      quality,
      sound: activeSound,
      storage: getStorage(window),
      now: () => window.performance.now(),
    });

    let logicalWidth = 0;
    let logicalHeight = 0;
    const measureBoard = (): void => {
      const boardRect = shell.board.getBoundingClientRect();
      if (
        !Number.isFinite(boardRect.width)
        || !Number.isFinite(boardRect.height)
        || boardRect.width <= 0
        || boardRect.height <= 0
      ) {
        return;
      }

      logicalWidth = boardRect.width;
      logicalHeight = boardRect.height;
      app?.resize({ width: logicalWidth, height: logicalHeight });
    };
    measureBoard();
    app.start();

    const canvasPoint = (
      event: PointerEvent,
    ): { x: number; y: number } | null => {
      const rect = shell.canvas.getBoundingClientRect();
      if (
        !Number.isFinite(rect.width)
        || !Number.isFinite(rect.height)
        || rect.width <= 0
        || rect.height <= 0
        || logicalWidth <= 0
        || logicalHeight <= 0
      ) {
        return null;
      }

      return {
        x: (event.clientX - rect.left) * logicalWidth / rect.width,
        y: (event.clientY - rect.top) * logicalHeight / rect.height,
      };
    };
    const clearPressed = (result: PointerResult): void => {
      if (
        result.kind === 'tap'
        || result.kind === 'queued'
        || result.kind === 'canceled'
      ) {
        app?.setPressedTube(null);
      }
    };
    const handlePointerDown: EventListener = (rawEvent) => {
      const event = rawEvent as PointerEvent;
      const point = canvasPoint(event);
      if (point === null) return;

      const result = pointer.down(event.pointerId, point.x, point.y);
      if (result.kind !== 'pressed') return;

      pointerOwner = event.pointerId;
      app?.setPressedTube(result.tube);
      try {
        if (typeof shell.canvas.setPointerCapture !== 'function') {
          installPointerFallback(event.pointerId);
          return;
        }
        shell.canvas.setPointerCapture(event.pointerId);
      } catch {
        installPointerFallback(event.pointerId);
      }
    };
    const handlePointerMove: EventListener = (rawEvent) => {
      const event = rawEvent as PointerEvent;
      const point = canvasPoint(event);
      if (point === null) {
        clearPressed(pointer.cancel(event.pointerId));
        if (pointerOwner === event.pointerId) pointerOwner = null;
        removePointerFallback(event.pointerId);
        releasePointer(shell.canvas, event.pointerId);
        return;
      }

      clearPressed(pointer.move(event.pointerId, point.x, point.y));
    };
    handlePointerUp = (rawEvent) => {
      const event = rawEvent as PointerEvent;
      if (pointerOwner !== event.pointerId) return;

      pointerOwner = null;
      removePointerFallback(event.pointerId);
      const point = canvasPoint(event);
      if (point === null) {
        clearPressed(pointer.cancel(event.pointerId));
        releasePointer(shell.canvas, event.pointerId);
        return;
      }

      const result = pointer.up(event.pointerId, point.x, point.y);
      clearPressed(result);
      releasePointer(shell.canvas, event.pointerId);
      if (result.kind === 'tap') {
        void app?.tapTube(result.tube).catch(() => undefined);
      }
    };
    handlePointerCancel = (rawEvent) => {
      const event = rawEvent as PointerEvent;
      if (pointerOwner !== event.pointerId) return;

      pointerOwner = null;
      removePointerFallback(event.pointerId);
      clearPressed(pointer.cancel(event.pointerId));
      releasePointer(shell.canvas, event.pointerId);
    };
    const handleLostPointerCapture: EventListener = (rawEvent) => {
      const event = rawEvent as PointerEvent;
      if (pointerOwner !== event.pointerId) return;

      pointerOwner = null;
      removePointerFallback(event.pointerId);
      clearPressed(pointer.cancel(event.pointerId));
    };
    const handleWindowBlur = (): void => {
      const owner = pointerOwner;
      pointerOwner = null;
      removePointerFallback();
      if (owner !== null) {
        pointer.cancel(owner);
        releasePointer(shell.canvas, owner);
      }
      app?.setPressedTube(null);
    };
    listen(shell.canvas, 'pointerdown', handlePointerDown);
    listen(shell.canvas, 'pointermove', handlePointerMove);
    listen(shell.canvas, 'pointerup', handlePointerUp);
    listen(shell.canvas, 'pointercancel', handlePointerCancel);
    listen(shell.canvas, 'lostpointercapture', handleLostPointerCapture);
    listen(window, 'blur', handleWindowBlur);

    listen(shell.undoButton, 'click', () => app?.undo());
    listen(shell.soundButton, 'click', () => app?.toggleSound());
    listen(shell.restartButton, 'click', () => app?.restart());
    listen(shell.nextButton, 'click', () => app?.nextLevel());
    listen(shell.replayButton, 'click', () => app?.replay());

    const syncVisibility = (): void => {
      if (document.hidden) app?.pause();
      else app?.resume();
    };
    const handlePageHide = (): void => app?.pause();
    const handlePageShow = (): void => app?.resume();
    listen(document, 'visibilitychange', syncVisibility);
    listen(window, 'pagehide', handlePageHide);
    listen(window, 'pageshow', handlePageShow);
    listen(window, 'orientationchange', measureBoard);

    type WindowWithResizeObserver = Window & {
      ResizeObserver?: typeof ResizeObserver;
    };
    const ResizeObserverClass = (window as WindowWithResizeObserver).ResizeObserver
      ?? globalThis.ResizeObserver;
    if (typeof ResizeObserverClass === 'function') {
      resizeObserver = new ResizeObserverClass(measureBoard);
      resizeObserver.observe(shell.board);
    } else {
      listen(window, 'resize', measureBoard);
    }
  };

  try {
    if (shell.canvas.getContext('2d') === null) {
      throw new Error('Canvas 2D is unavailable');
    }
    initialize();
    return cleanup;
  } catch (error) {
    try {
      await cleanup();
    } catch {
      // The initialization error remains the primary failure.
    }
    shell.showFatalError();
    enableFatalRetry();
    throw error;
  }
}

if (typeof document !== 'undefined') {
  const parent = document.querySelector<HTMLElement>('#app');
  if (parent !== null) {
    void startGame({ document, window, parent }).catch(() => undefined);
  }
}
