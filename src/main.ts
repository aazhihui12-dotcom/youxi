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
  const listen = (
    target: EventTarget,
    type: string,
    listener: EventListener,
  ): void => {
    target.addEventListener(type, listener);
    removers.push(() => target.removeEventListener(type, listener));
  };
  const handleRetry = (): void => window.location.reload();
  listen(shell.retryButton, 'click', handleRetry);

  if (shell.canvas.getContext('2d') === null) {
    shell.showFatalError();
    throw new Error('Canvas 2D is unavailable');
  }

  const quality = new AdaptiveQuality(window.devicePixelRatio);
  const renderer = new CanvasRenderer(shell.canvas);
  let app: GameApp | null = null;
  const scheduler = new RenderScheduler(() => app?.render());
  const sound = new SoundController();
  const pointer = new PointerController(
    (x, y) => app?.hitTestTube(x, y) ?? null,
  );
  app = new GameApp({
    shell,
    renderer,
    scheduler,
    pointer,
    quality,
    sound,
    storage: getStorage(window),
    now: () => window.performance.now(),
  });

  const measureBoard = (): void => {
    const boardRect = shell.board.getBoundingClientRect();
    app?.resize({ width: boardRect.width, height: boardRect.height });
  };
  const boardRect = shell.board.getBoundingClientRect();
  app.resize({ width: boardRect.width, height: boardRect.height });
  app.start();

  const canvasPoint = (event: PointerEvent): { x: number; y: number } => {
    const rect = shell.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
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
    const result = pointer.down(event.pointerId, point.x, point.y);
    if (result.kind !== 'pressed') return;

    app?.setPressedTube(result.tube);
    try {
      shell.canvas.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer interaction still works when capture is unavailable.
    }
  };
  const handlePointerMove: EventListener = (rawEvent) => {
    const event = rawEvent as PointerEvent;
    const point = canvasPoint(event);
    clearPressed(pointer.move(event.pointerId, point.x, point.y));
  };
  const handlePointerUp: EventListener = (rawEvent) => {
    const event = rawEvent as PointerEvent;
    const point = canvasPoint(event);
    const result = pointer.up(event.pointerId, point.x, point.y);
    clearPressed(result);
    releasePointer(shell.canvas, event.pointerId);
    if (result.kind === 'tap') {
      void app?.tapTube(result.tube).catch(() => undefined);
    }
  };
  const handlePointerCancel: EventListener = (rawEvent) => {
    const event = rawEvent as PointerEvent;
    clearPressed(pointer.cancel(event.pointerId));
    releasePointer(shell.canvas, event.pointerId);
  };
  listen(shell.canvas, 'pointerdown', handlePointerDown);
  listen(shell.canvas, 'pointermove', handlePointerMove);
  listen(shell.canvas, 'pointerup', handlePointerUp);
  listen(shell.canvas, 'pointercancel', handlePointerCancel);

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
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserverClass === 'function') {
    resizeObserver = new ResizeObserverClass(measureBoard);
    resizeObserver.observe(shell.board);
  } else {
    listen(window, 'resize', measureBoard);
  }

  let cleanedUp = false;
  return async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    resizeObserver?.disconnect();
    for (const remove of removers.reverse()) remove();
    const currentApp = app;
    app = null;
    if (currentApp !== null) await currentApp.destroy();
  };
}

if (typeof document !== 'undefined') {
  const parent = document.querySelector<HTMLElement>('#app');
  if (parent !== null) {
    void startGame({ document, window, parent }).catch(() => undefined);
  }
}
