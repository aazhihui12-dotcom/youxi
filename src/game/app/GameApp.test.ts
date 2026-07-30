import { describe, expect, it, vi } from 'vitest';
import { RenderScheduler } from '../canvas/renderScheduler';
import { computeResponsiveLayout } from '../canvas/responsiveLayout';
import { GameApp } from './GameApp';

function createPorts() {
  return {
    shell: {
      setLevel: vi.fn(),
      setGuideVisible: vi.fn(),
      setSoundEnabled: vi.fn(),
      setControlsEnabled: vi.fn(),
      showClear: vi.fn(),
      hideClear: vi.fn(),
      showFatalError: vi.fn(),
    },
    renderer: { resize: vi.fn(), render: vi.fn(), clearCache: vi.fn() },
    scheduler: {
      invalidate: vi.fn(),
      animate: vi.fn(async (step: (timeMs: number) => boolean) => {
        step(0);
        step(900);
      }),
      stop: vi.fn(),
      running: false,
    },
    pointer: {
      setBusy: vi.fn(),
      takeQueuedTap: vi.fn<() => number | null>(() => null),
      reset: vi.fn(),
    },
    quality: {
      config: {
        level: 'high',
        maxPixelRatio: 2,
        glow: true,
        confettiCount: 32,
      },
      observeFrame: vi.fn(),
    },
    sound: {
      enabled: true,
      play: vi.fn(),
      setEnabled: vi.fn(),
      dispose: vi.fn(async () => undefined),
    },
    storage: {
      value: null as string | null,
      getItem() { return this.value; },
      setItem(_key: string, value: string) { this.value = value; },
    },
    now: vi.fn(() => 0),
  };
}

const LEVEL_ONE_SOLUTION = [
  [0, 4],
  [3, 0],
  [2, 3],
  [1, 2],
  [1, 4],
  [0, 1],
  [3, 0],
  [2, 3],
  [2, 4],
  [1, 2],
  [0, 1],
  [3, 0],
  [3, 4],
] as const;

const LEVEL_EIGHT_SOLUTION = [
  [0, 6],
  [4, 0],
  [2, 4],
  [2, 6],
  [0, 2],
  [4, 0],
  [4, 6],
  [5, 4],
  [3, 5],
  [1, 3],
  [1, 4],
  [5, 1],
  [3, 5],
  [3, 4],
  [2, 3],
  [1, 2],
  [0, 1],
  [5, 0],
  [5, 6],
] as const;

async function playMoves(
  app: GameApp,
  moves: readonly (readonly [number, number])[],
): Promise<void> {
  for (const [from, to] of moves) {
    await app.tapTube(from);
    await app.tapTube(to);
  }
}

function deferAnimation(ports: ReturnType<typeof createPorts>) {
  let step: (timeMs: number) => boolean = () => false;
  let resolveAnimation: () => void = () => undefined;
  ports.scheduler.animate.mockImplementation((nextStep) => {
    step = nextStep;
    return new Promise<void>((resolve) => { resolveAnimation = resolve; });
  });
  ports.scheduler.stop.mockImplementation(() => resolveAnimation());
  return {
    step: (timeMs: number) => step(timeMs),
    finish: () => resolveAnimation(),
  };
}

describe('GameApp', () => {
  it('starts directly at the persisted level', () => {
    const ports = createPorts();
    ports.storage.value = JSON.stringify({
      version: 1,
      currentLevel: 3,
      bestMoves: {},
      soundEnabled: true,
    });
    const app = new GameApp(ports as never);

    app.start();

    expect(ports.shell.setLevel).toHaveBeenCalledWith(3);
    expect(ports.scheduler.invalidate).toHaveBeenCalled();
  });

  it('invalidates immediately when the pressed tube changes', () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    ports.scheduler.invalidate.mockClear();

    app.setPressedTube(2);

    expect(ports.scheduler.invalidate).toHaveBeenCalledOnce();
  });

  it('hit-tests using local Canvas coordinates after resize', () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    app.resize({ width: 366, height: 540 });
    const layout = computeResponsiveLayout({ width: 366, height: 540, tubeCount: 6 });
    const first = layout.tubes[0]!;

    expect(app.hitTestTube(first.centerX, first.centerY)).toBe(0);
    expect(app.hitTestTube(-10, -10)).toBeNull();
  });

  it('selects a source and completes a legal pour', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();

    await app.tapTube(0);
    await app.tapTube(5);

    expect(ports.pointer.setBusy).toHaveBeenCalledWith(true);
    expect(ports.scheduler.animate).toHaveBeenCalledOnce();
    expect(ports.pointer.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('processes one queued tap after the pour commits', async () => {
    const ports = createPorts();
    ports.pointer.takeQueuedTap
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(null);
    const app = new GameApp(ports as never);
    app.start();

    await app.tapTube(0);
    await app.tapTube(5);

    expect(ports.pointer.takeQueuedTap).toHaveBeenCalledOnce();
    expect(ports.scheduler.invalidate).toHaveBeenCalled();
  });

  it('ignores gameplay taps while the page is paused', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();

    app.pause();
    await app.tapTube(0);
    expect(ports.sound.play).not.toHaveBeenCalled();

    app.resume();
    await app.tapTube(0);
    expect(ports.sound.play).toHaveBeenCalledWith('select');
  });

  it('commits once and unlocks when resize cancels an active pour', async () => {
    const ports = createPorts();
    let finishAnimation: () => void = () => undefined;
    ports.scheduler.animate.mockImplementation(
      () => new Promise<void>((resolve) => { finishAnimation = resolve; }),
    );
    ports.scheduler.stop.mockImplementation(() => finishAnimation());
    const app = new GameApp(ports as never);
    app.start();
    app.resize({ width: 366, height: 540 });
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    app.resize({ width: 360, height: 500 });
    await pouring;

    expect(ports.pointer.setBusy).toHaveBeenLastCalledWith(false);
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
  });

  it('uses persisted sound and recomputes a pre-start layout for the loaded level', () => {
    const ports = createPorts();
    ports.storage.value = JSON.stringify({
      version: 1,
      currentLevel: 7,
      bestMoves: {},
      soundEnabled: false,
    });
    const app = new GameApp(ports as never);
    app.resize({ width: 400, height: 600 });

    app.start();
    app.render();

    expect(ports.sound.setEnabled).toHaveBeenCalledWith(false);
    expect(ports.shell.setSoundEnabled).toHaveBeenCalledWith(false);
    expect(ports.renderer.render.mock.lastCall?.[0].tubes).toHaveLength(8);
  });

  it('renders selection and legal targets without changing the board', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();

    await app.tapTube(0);
    app.render();
    const model = ports.renderer.render.mock.lastCall?.[0];

    expect(model.tubes[0]).toMatchObject({
      colors: ['pink', 'yellow', 'mint', 'blue'],
      selected: true,
    });
    expect(model.tubes.map((tube: { validTarget: boolean }) => tube.validTarget))
      .toEqual([false, false, false, false, true, true]);
  });

  it('undoes a committed move and restart cancels back to the initial board', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    await app.tapTube(0);
    await app.tapTube(5);

    app.undo();
    app.render();
    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors).toEqual([]);

    await app.tapTube(0);
    await app.tapTube(5);
    app.restart();
    app.render();

    expect(ports.scheduler.stop).toHaveBeenCalled();
    expect(ports.pointer.reset).toHaveBeenCalled();
    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors).toEqual([]);
    expect(ports.shell.setControlsEnabled).toHaveBeenLastCalledWith({
      undo: false,
      restart: true,
      sound: true,
    });
  });

  it('persists and synchronizes sound changes', () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();

    app.toggleSound();

    expect(ports.sound.setEnabled).toHaveBeenCalledWith(false);
    expect(ports.shell.setSoundEnabled).toHaveBeenLastCalledWith(false);
    expect(JSON.parse(ports.storage.value ?? '')).toMatchObject({
      version: 1,
      currentLevel: 1,
      soundEnabled: false,
    });
  });

  it('resizes for a lower quality DPR without changing hit areas', async () => {
    const ports = createPorts();
    ports.quality.observeFrame.mockReturnValue({
      level: 'balanced',
      maxPixelRatio: 1.5,
      glow: false,
      confettiCount: 20,
    });
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    const layout = computeResponsiveLayout({ width: 366, height: 540, tubeCount: 6 });

    await app.tapTube(0);
    await app.tapTube(5);

    expect(ports.quality.observeFrame).toHaveBeenCalledWith(900);
    expect(ports.renderer.resize).toHaveBeenLastCalledWith(366, 540, 1.5);
    expect(app.hitTestTube(
      layout.tubes[0]!.centerX,
      layout.tubes[0]!.centerY,
    )).toBe(0);
  });

  it('does not commit a canceled pour after restart', async () => {
    const ports = createPorts();
    let finishAnimation: () => void = () => undefined;
    ports.scheduler.animate.mockImplementation(
      () => new Promise<void>((resolve) => { finishAnimation = resolve; }),
    );
    ports.scheduler.stop.mockImplementation(() => finishAnimation());
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    app.restart();
    await pouring;
    app.render();

    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors).toEqual([]);
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
  });

  it('destroys during a pour without running post-animation interaction', async () => {
    const ports = createPorts();
    let finishAnimation: () => void = () => undefined;
    ports.scheduler.animate.mockImplementation(
      () => new Promise<void>((resolve) => { finishAnimation = resolve; }),
    );
    ports.scheduler.stop.mockImplementation(() => finishAnimation());
    const app = new GameApp(ports as never);
    app.start();
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    await app.destroy();
    await pouring;

    expect(ports.pointer.reset).toHaveBeenCalled();
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
    expect(ports.sound.dispose).toHaveBeenCalledOnce();
  });

  it('saves a solved result once, excludes paused time, and advances or replays', async () => {
    const ports = createPorts();
    ports.storage.value = JSON.stringify({
      version: 1,
      currentLevel: 1,
      bestMoves: { '1': 10 },
      soundEnabled: true,
    });
    let clock = 0;
    ports.now.mockImplementation(() => clock);
    const app = new GameApp(ports as never);
    app.start();
    clock = 100;
    app.pause();
    clock = 1_000;
    app.resume();
    ports.now.mockImplementation(() => {
      clock += 100;
      return clock;
    });

    for (const [from, to] of LEVEL_ONE_SOLUTION) {
      await app.tapTube(from);
      await app.tapTube(to);
    }

    expect(ports.shell.showClear).toHaveBeenCalledOnce();
    expect(ports.shell.showClear).toHaveBeenCalledWith({
      moves: 13,
      elapsedSeconds: 4,
      hasNext: true,
    });
    expect(ports.sound.play).toHaveBeenCalledWith('success');
    expect(JSON.parse(ports.storage.value ?? '').bestMoves).toEqual({ '1': 10 });

    app.nextLevel();
    expect(ports.shell.setLevel).toHaveBeenLastCalledWith(2);
    expect(JSON.parse(ports.storage.value ?? '').currentLevel).toBe(2);

    app.replay();
    expect(ports.shell.setLevel).toHaveBeenLastCalledWith(2);
    expect(ports.shell.hideClear).toHaveBeenCalled();
  });

  it('settles a real scheduler animation when Canvas rendering throws', async () => {
    const ports = createPorts();
    const callbacks: FrameRequestCallback[] = [];
    let app!: GameApp;
    const scheduler = new RenderScheduler(
      () => app.render(),
      (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      () => undefined,
    );
    let throwPourFrame = true;
    ports.renderer.render.mockImplementation((model) => {
      if (throwPourFrame && model.pour !== null) {
        throwPourFrame = false;
        throw new Error('Canvas frame failed');
      }
    });
    ports.pointer.takeQueuedTap.mockReturnValue(1);
    app = new GameApp({ ...ports, scheduler } as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    callbacks.shift()!(0);
    await app.tapTube(0);
    callbacks.shift()!(10);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    expect(() => callbacks.shift()!(20)).not.toThrow();
    await pouring;
    callbacks.shift()!(30);
    app.render();

    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors)
      .toEqual(['blue']);
    expect(ports.pointer.reset).toHaveBeenCalled();
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
    expect(ports.shell.setControlsEnabled).toHaveBeenLastCalledWith({
      undo: true,
      restart: true,
      sound: true,
    });
    expect(scheduler.running).toBe(false);
  });

  it.each(['initial', 'idle'] as const)(
    'enters a fatal idle state when the %s render fails',
    async (failure) => {
      const ports = createPorts();
      const callbacks: FrameRequestCallback[] = [];
      let app!: GameApp;
      const scheduler = new RenderScheduler(
        () => app.render(),
        (callback) => {
          callbacks.push(callback);
          return callbacks.length;
        },
        () => undefined,
      );
      let renderCount = 0;
      ports.renderer.render.mockImplementation(() => {
        renderCount += 1;
        if (failure === 'initial' || renderCount === 2) {
          throw new Error('Canvas idle frame failed');
        }
      });
      app = new GameApp({ ...ports, scheduler } as never);
      app.resize({ width: 366, height: 540 });
      app.start();

      callbacks.shift()!(0);
      if (failure === 'idle') {
        expect(ports.shell.showFatalError).not.toHaveBeenCalled();
        app.setPressedTube(0);
        callbacks.shift()!(10);
      }

      expect(ports.shell.showFatalError).toHaveBeenCalledOnce();
      expect(ports.pointer.reset).toHaveBeenCalled();
      expect(ports.shell.setControlsEnabled).toHaveBeenLastCalledWith({
        undo: false,
        restart: false,
        sound: false,
      });
      expect(callbacks).toHaveLength(0);
      expect(scheduler.running).toBe(false);

      app.setPressedTube(1);
      await app.tapTube(0);
      expect(callbacks).toHaveLength(0);
    },
  );

  it.each(['quality observation', 'quality DPR resize'] as const)(
    'settles a real scheduler animation when %s throws',
    async (failure) => {
      const ports = createPorts();
      const callbacks: FrameRequestCallback[] = [];
      let app!: GameApp;
      const scheduler = new RenderScheduler(
        () => app.render(),
        (callback) => {
          callbacks.push(callback);
          return callbacks.length;
        },
        () => undefined,
      );
      ports.pointer.takeQueuedTap.mockReturnValue(1);
      app = new GameApp({ ...ports, scheduler } as never);
      app.resize({ width: 366, height: 540 });
      app.start();
      callbacks.shift()!(0);
      await app.tapTube(0);
      callbacks.shift()!(10);
      if (failure === 'quality observation') {
        ports.quality.observeFrame.mockImplementation(() => {
          throw new Error('quality observation failed');
        });
      } else {
        ports.quality.observeFrame.mockReturnValue({
          level: 'balanced',
          maxPixelRatio: 1.5,
          glow: false,
          confettiCount: 20,
        });
        ports.renderer.resize.mockImplementation(() => {
          throw new Error('quality DPR resize failed');
        });
      }
      const pouring = app.tapTube(5);
      await Promise.resolve();
      callbacks.shift()!(20);

      expect(() => callbacks.shift()!(40)).not.toThrow();
      await pouring;
      callbacks.shift()!(50);
      app.render();

      expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors)
        .toEqual(['blue']);
      expect(ports.pointer.reset).toHaveBeenCalled();
      expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
      expect(scheduler.running).toBe(false);
    },
  );

  it('clears the queued tap when an animation promise rejects', async () => {
    const ports = createPorts();
    ports.scheduler.animate.mockRejectedValue(new Error('animation rejected'));
    ports.pointer.takeQueuedTap.mockReturnValue(1);
    const app = new GameApp(ports as never);
    app.start();
    await app.tapTube(0);

    await app.tapTube(5);

    expect(ports.pointer.reset).toHaveBeenCalled();
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
    expect(ports.pointer.setBusy).toHaveBeenLastCalledWith(false);
  });

  it('enters the clear flow once when resize commits the winning move', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    await playMoves(app, LEVEL_ONE_SOLUTION.slice(0, -1));
    const deferred = deferAnimation(ports);
    await app.tapTube(3);
    const winningPour = app.tapTube(4);
    await Promise.resolve();

    app.resize({ width: 360, height: 500 });
    await winningPour;

    expect(ports.shell.showClear).toHaveBeenCalledOnce();
    expect(ports.sound.play).toHaveBeenCalledWith('success');
    expect(JSON.parse(ports.storage.value ?? '').bestMoves).toEqual({ '1': 13 });
    deferred.finish();
  });

  it('reconciles an immediately paused and resumed winning move once', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.start();
    await playMoves(app, LEVEL_ONE_SOLUTION.slice(0, -1));
    deferAnimation(ports);
    await app.tapTube(3);
    const winningPour = app.tapTube(4);
    await Promise.resolve();

    app.pause();
    app.resume();
    await winningPour;

    expect(ports.shell.showClear).toHaveBeenCalledOnce();
    expect(ports.sound.play).toHaveBeenCalledWith('success');
    expect(JSON.parse(ports.storage.value ?? '').bestMoves).toEqual({ '1': 13 });
  });

  it('uses the 160 ms invalid-shake boundary', async () => {
    const ports = createPorts();
    const deferred = deferAnimation(ports);
    const app = new GameApp(ports as never);
    app.start();

    await app.tapTube(4);

    expect(deferred.step(0)).toBe(true);
    expect(deferred.step(159)).toBe(true);
    expect(deferred.step(160)).toBe(false);
    await app.destroy();
  });

  it('clears a nonzero invalid shake before rendering after resume', async () => {
    const ports = createPorts();
    const deferred = deferAnimation(ports);
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    const layout = computeResponsiveLayout({ width: 366, height: 540, tubeCount: 6 });
    await app.tapTube(4);
    deferred.step(0);
    deferred.step(30);
    app.render();
    expect(ports.renderer.render.mock.lastCall?.[0].tubes[4].layout.centerX)
      .not.toBe(layout.tubes[4]!.centerX);

    app.pause();
    app.resume();
    app.render();

    expect(ports.renderer.render.mock.lastCall?.[0].tubes[4].layout.centerX)
      .toBe(layout.tubes[4]!.centerX);
  });

  it('keeps pre-start gameplay and persistence inert while allowing resize', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);

    app.resize({ width: 366, height: 540 });
    expect(app.hitTestTube(60, 135)).not.toBeNull();
    ports.scheduler.stop.mockClear();
    ports.scheduler.invalidate.mockClear();
    ports.pointer.reset.mockClear();
    await app.tapTube(0);
    app.undo();
    app.restart();
    app.toggleSound();
    app.nextLevel();
    app.replay();
    app.pause();
    app.resume();
    app.setPressedTube(2);
    app.render();

    expect(ports.storage.value).toBeNull();
    expect(ports.sound.play).not.toHaveBeenCalled();
    expect(ports.sound.setEnabled).not.toHaveBeenCalled();
    expect(ports.scheduler.animate).not.toHaveBeenCalled();
    expect(ports.scheduler.stop).not.toHaveBeenCalled();
    expect(ports.scheduler.invalidate).not.toHaveBeenCalled();
    expect(ports.pointer.reset).not.toHaveBeenCalled();
    expect(ports.renderer.render).not.toHaveBeenCalled();
    expect(ports.shell.setLevel).not.toHaveBeenCalled();
  });

  it('starts once and cannot reset an active pour', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    ports.scheduler.stop.mockClear();
    const deferred = deferAnimation(ports);
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    app.start();
    expect(ports.shell.setLevel).toHaveBeenCalledOnce();
    expect(ports.scheduler.stop).not.toHaveBeenCalled();
    deferred.finish();
    await pouring;
    app.render();

    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors)
      .toEqual(['blue']);
  });

  it.each([
    ['next level', (app: GameApp) => app.nextLevel(), 2],
    ['replay', (app: GameApp) => app.replay(), 1],
  ] as const)('cancels an active pour before %s replacement', async (
    _label,
    replace,
    expectedLevel,
  ) => {
    const ports = createPorts();
    const app = new GameApp(ports as never);
    app.resize({ width: 366, height: 540 });
    app.start();
    deferAnimation(ports);
    await app.tapTube(0);
    const pouring = app.tapTube(5);
    await Promise.resolve();

    replace(app);
    await pouring;
    app.render();

    expect(ports.shell.setLevel).toHaveBeenLastCalledWith(expectedLevel);
    expect(ports.renderer.render.mock.lastCall?.[0].tubes[5].colors).toEqual([]);
    expect(ports.pointer.takeQueuedTap).not.toHaveBeenCalled();
  });

  it('destroys safely before start and cannot be started afterward', async () => {
    const ports = createPorts();
    const app = new GameApp(ports as never);

    await app.destroy();
    await app.destroy();
    app.start();

    expect(ports.sound.dispose).toHaveBeenCalledOnce();
    expect(ports.shell.setLevel).not.toHaveBeenCalled();
  });

  it('clears level eight without offering a nonexistent next level', async () => {
    const ports = createPorts();
    ports.storage.value = JSON.stringify({
      version: 1,
      currentLevel: 8,
      bestMoves: {},
      soundEnabled: true,
    });
    const app = new GameApp(ports as never);
    app.start();

    await playMoves(app, LEVEL_EIGHT_SOLUTION);

    expect(ports.shell.showClear).toHaveBeenCalledWith({
      moves: 19,
      elapsedSeconds: 0,
      hasNext: false,
    });
    expect(JSON.parse(ports.storage.value ?? '').bestMoves).toEqual({ '8': 19 });
  });
});
