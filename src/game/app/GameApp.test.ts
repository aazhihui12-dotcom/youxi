import { describe, expect, it, vi } from 'vitest';
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
    expect(JSON.parse(ports.storage.value ?? '').bestMoves).toEqual({ '1': 13 });

    app.nextLevel();
    expect(ports.shell.setLevel).toHaveBeenLastCalledWith(2);
    expect(JSON.parse(ports.storage.value ?? '').currentLevel).toBe(2);

    app.replay();
    expect(ports.shell.setLevel).toHaveBeenLastCalledWith(2);
    expect(ports.shell.hideClear).toHaveBeenCalled();
  });
});
