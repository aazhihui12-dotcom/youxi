// @vitest-environment jsdom
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { GameApp } from './game/app/GameApp';
import { startGame } from './main';

function installAnimationFrame(): void {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
}

function installCanvasContext(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(),
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
}

function pointerEvent(
  type: string,
  input: { pointerId: number; clientX: number; clientY: number },
): Event {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: input.pointerId },
    clientX: { value: input.clientX },
    clientY: { value: input.clientY },
  });
  return event;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('startGame', () => {
  it('creates one canvas and reacts to resize without login', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });

    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(document.body.textContent).toContain('色をそろえよう！');
    window.dispatchEvent(new Event('resize'));
    await cleanup();
  });

  it('shows the Japanese retry panel when Canvas 2D is unavailable', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    await expect(startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    })).rejects.toThrow('Canvas 2D is unavailable');

    expect(document.body.textContent).toContain('ゲームを読み込めませんでした');
  });

  it('scales client pointer coordinates into logical Canvas CSS coordinates', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRect(this: HTMLElement) {
        return this instanceof HTMLCanvasElement
          ? new DOMRect(15, 30, 160, 240)
          : new DOMRect(0, 0, 320, 480);
      });
    const hitTest = vi.spyOn(GameApp.prototype, 'hitTestTube').mockReturnValue(2);
    const setPressed = vi.spyOn(GameApp.prototype, 'setPressedTube');
    const tapTube = vi.spyOn(GameApp.prototype, 'tapTube')
      .mockResolvedValue(undefined);
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });
    const canvas = document.querySelector('canvas')!;
    const setPointerCapture = vi.fn();
    Object.defineProperty(canvas, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });

    canvas.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 7,
      clientX: 65,
      clientY: 130,
    }));
    canvas.dispatchEvent(pointerEvent('pointerup', {
      pointerId: 7,
      clientX: 65,
      clientY: 130,
    }));
    await cleanup();

    expect(hitTest).toHaveBeenCalledWith(100, 200);
    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(setPressed).toHaveBeenNthCalledWith(1, 2);
    expect(setPressed).toHaveBeenLastCalledWith(null);
    expect(tapTube).toHaveBeenCalledWith(2);
  });

  it('ignores pointer input while the Canvas client rectangle has no area', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRect(this: HTMLElement) {
        return this instanceof HTMLCanvasElement
          ? new DOMRect(15, 30, 0, 0)
          : new DOMRect(0, 0, 320, 480);
      });
    const hitTest = vi.spyOn(GameApp.prototype, 'hitTestTube').mockReturnValue(2);
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });
    const canvas = document.querySelector('canvas')!;

    canvas.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 7,
      clientX: 65,
      clientY: 130,
    }));
    await cleanup();

    expect(hitTest).not.toHaveBeenCalled();
  });

  it('clears a pressed tube when pointer movement or cancellation aborts it', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 320, 480));
    vi.spyOn(GameApp.prototype, 'hitTestTube').mockReturnValue(1);
    const setPressed = vi.spyOn(GameApp.prototype, 'setPressedTube');
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });
    const canvas = document.querySelector('canvas')!;
    Object.defineProperty(canvas, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });

    canvas.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 3,
      clientX: 20,
      clientY: 20,
    }));
    canvas.dispatchEvent(pointerEvent('pointermove', {
      pointerId: 3,
      clientX: 40,
      clientY: 20,
    }));
    canvas.dispatchEvent(pointerEvent('pointerup', {
      pointerId: 3,
      clientX: 40,
      clientY: 20,
    }));
    canvas.dispatchEvent(pointerEvent('pointerdown', {
      pointerId: 4,
      clientX: 20,
      clientY: 20,
    }));
    canvas.dispatchEvent(pointerEvent('pointercancel', {
      pointerId: 4,
      clientX: 20,
      clientY: 20,
    }));

    expect(setPressed.mock.calls).toEqual([
      [1],
      [null],
      [1],
      [null],
    ]);
    await cleanup();
  });

  it('connects controls and lifecycle events, then removes them on cleanup', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    let boardWidth = 320;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getRect() {
        return new DOMRect(0, 0, boardWidth, 480);
      });
    let resizeCallback: ResizeObserverCallback = () => undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }

      observe = observe;
      disconnect = disconnect;
      unobserve = vi.fn();
    }
    vi.stubGlobal('ResizeObserver', TestResizeObserver);
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const resize = vi.spyOn(GameApp.prototype, 'resize');
    const pause = vi.spyOn(GameApp.prototype, 'pause');
    const resume = vi.spyOn(GameApp.prototype, 'resume');
    const undo = vi.spyOn(GameApp.prototype, 'undo');
    const toggleSound = vi.spyOn(GameApp.prototype, 'toggleSound');
    const restart = vi.spyOn(GameApp.prototype, 'restart');
    const nextLevel = vi.spyOn(GameApp.prototype, 'nextLevel');
    const replay = vi.spyOn(GameApp.prototype, 'replay');
    const destroy = vi.spyOn(GameApp.prototype, 'destroy');
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });

    expect(observe).toHaveBeenCalledWith(document.querySelector('.board-wrap'));
    boardWidth = 360;
    resizeCallback([], {} as ResizeObserver);
    window.dispatchEvent(new Event('orientationchange'));
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    const undoButton = document.querySelector<HTMLButtonElement>('.undo')!;
    undoButton.disabled = false;
    undoButton.click();
    document.querySelector<HTMLButtonElement>('.sound')!.click();
    document.querySelector<HTMLButtonElement>('.restart-button')!.click();
    document.querySelector<HTMLButtonElement>('.next-button')!.click();
    document.querySelector<HTMLButtonElement>('.replay-button')!.click();

    expect(resize).toHaveBeenCalledWith({ width: 360, height: 480 });
    expect(pause).toHaveBeenCalledTimes(2);
    expect(resume).toHaveBeenCalledTimes(2);
    expect(undo).toHaveBeenCalledOnce();
    expect(toggleSound).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
    expect(nextLevel).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledOnce();

    await cleanup();
    const callsAfterCleanup = {
      resize: resize.mock.calls.length,
      pause: pause.mock.calls.length,
      resume: resume.mock.calls.length,
      undo: undo.mock.calls.length,
    };
    window.dispatchEvent(new Event('orientationchange'));
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    window.dispatchEvent(new Event('pageshow'));
    undoButton.click();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect({
      resize: resize.mock.calls.length,
      pause: pause.mock.calls.length,
      resume: resume.mock.calls.length,
      undo: undo.mock.calls.length,
    }).toEqual(callsAfterCleanup);
  });

  it('falls back when localStorage access throws and reloads from retry', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 320, 480));
    const reload = vi.fn();
    const injectedWindow = {
      devicePixelRatio: 1,
      performance: window.performance,
      get localStorage(): Storage {
        throw new Error('blocked');
      },
      location: { reload },
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    const cleanup = await startGame({
      document,
      window: injectedWindow,
      parent: document.querySelector<HTMLElement>('#app')!,
    });

    document.querySelector<HTMLButtonElement>('.retry-button')!.click();

    expect(reload).toHaveBeenCalledOnce();
    await cleanup();
  });

  it('returns one cleanup promise that waits for destruction exactly once', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 320, 480));
    let finishDestroy = (): void => undefined;
    const destroy = vi.spyOn(GameApp.prototype, 'destroy')
      .mockImplementation(() => new Promise<void>((resolve) => {
        finishDestroy = resolve;
      }));
    const cleanup = await startGame({
      document,
      window,
      parent: document.querySelector<HTMLElement>('#app')!,
    });

    const firstCleanup = cleanup();
    const secondCleanup = cleanup();
    let firstSettled = false;
    let secondSettled = false;
    void firstCleanup.then(() => { firstSettled = true; });
    void secondCleanup.then(() => { secondSettled = true; });
    await Promise.resolve();
    await Promise.resolve();
    const settledBeforeDestroy = { firstSettled, secondSettled };
    finishDestroy();
    await Promise.all([firstCleanup, secondCleanup]);

    expect(firstCleanup).toBe(secondCleanup);
    expect(settledBeforeDestroy).toEqual({
      firstSettled: false,
      secondSettled: false,
    });
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('awaits rollback when observer setup fails and leaves only retry active', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    installAnimationFrame();
    installCanvasContext();
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 320, 480));
    const observeError = new Error('observer setup failed');
    const disconnect = vi.fn();
    class ThrowingResizeObserver {
      observe(): void {
        throw observeError;
      }

      disconnect = disconnect;
      unobserve = vi.fn();
    }
    const reload = vi.fn();
    const injectedWindow = {
      ResizeObserver: ThrowingResizeObserver,
      devicePixelRatio: 1,
      performance: window.performance,
      localStorage: window.localStorage,
      location: { reload },
      addEventListener: window.addEventListener.bind(window),
      removeEventListener: window.removeEventListener.bind(window),
    } as unknown as Window;
    let finishDestroy = (): void => undefined;
    const destroy = vi.spyOn(GameApp.prototype, 'destroy')
      .mockImplementation(() => new Promise<void>((resolve) => {
        finishDestroy = resolve;
      }));
    const pause = vi.spyOn(GameApp.prototype, 'pause');

    const starting = startGame({
      document,
      window: injectedWindow,
      parent: document.querySelector<HTMLElement>('#app')!,
    });
    let settled = false;
    void starting.then(
      () => { settled = true; },
      () => { settled = true; },
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(destroy).toHaveBeenCalledOnce();
    expect(settled).toBe(false);
    finishDestroy();
    await expect(starting).rejects.toThrow(observeError);

    const pauseCalls = pause.mock.calls.length;
    window.dispatchEvent(new Event('pagehide'));
    expect(pause).toHaveBeenCalledTimes(pauseCalls);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('ゲームを読み込めませんでした');
    document.querySelector<HTMLButtonElement>('.retry-button')!.click();
    expect(reload).toHaveBeenCalledOnce();
  });
});
