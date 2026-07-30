import { describe, expect, it } from 'vitest';
import { RenderScheduler } from './renderScheduler';

describe('RenderScheduler', () => {
  it('coalesces invalidations and returns to idle after one frame', () => {
    const callbacks: FrameRequestCallback[] = [];
    let renders = 0;
    const scheduler = new RenderScheduler(
      () => { renders += 1; },
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );

    scheduler.invalidate();
    scheduler.invalidate();
    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(10);
    expect(renders).toBe(1);
    expect(scheduler.running).toBe(false);
  });

  it('runs animation frames only while the step returns true', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    let calls = 0;

    const done = scheduler.animate(() => {
      calls += 1;
      return calls < 2;
    });
    callbacks.shift()!(10);
    callbacks.shift()!(20);
    await done;

    expect(calls).toBe(2);
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('resolves the active animation when stopped', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    const done = scheduler.animate(() => true);

    scheduler.stop();

    await expect(done).resolves.toBeUndefined();
    expect(scheduler.running).toBe(false);
  });

  it('stays idle when an animation step stops the scheduler', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let scheduler!: RenderScheduler;
    scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    const done = scheduler.animate(() => {
      scheduler.stop();
      return true;
    });

    callbacks.shift()!(10);

    await expect(done).resolves.toBeUndefined();
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('stays idle when render stops the scheduler during an animation frame', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let scheduler: RenderScheduler;
    scheduler = new RenderScheduler(
      () => scheduler.stop(),
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    const done = scheduler.animate(() => true);

    callbacks.shift()!(10);

    await expect(done).resolves.toBeUndefined();
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('keeps a replacement animation started by a step', async () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = new RenderScheduler(
      () => undefined,
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    let replacementCalls = 0;

    const original = scheduler.animate(() => {
      scheduler.animate(() => {
        replacementCalls += 1;
        return false;
      });
      return false;
    });
    callbacks.shift()!(10);

    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(20);
    await expect(original).resolves.toBeUndefined();
    expect(replacementCalls).toBe(1);
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('keeps a replacement animation started by render', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let replaceAnimation = false;
    let replacementCalls = 0;
    const scheduler = new RenderScheduler(
      () => {
        if (!replaceAnimation) return;
        replaceAnimation = false;
        scheduler.animate(() => {
          replacementCalls += 1;
          return false;
        });
      },
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );

    const original = scheduler.animate(() => {
      replaceAnimation = true;
      return false;
    });
    callbacks.shift()!(10);

    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(20);
    await expect(original).resolves.toBeUndefined();
    expect(replacementCalls).toBe(1);
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });

  it('coalesces invalidation during an animation frame', async () => {
    const callbacks: FrameRequestCallback[] = [];
    let scheduler: RenderScheduler;
    let frames = 0;
    let invalidateOnRender = true;
    scheduler = new RenderScheduler(
      () => {
        if (!invalidateOnRender) return;
        invalidateOnRender = false;
        scheduler.invalidate();
      },
      (callback) => { callbacks.push(callback); return callbacks.length; },
      () => undefined,
    );
    const done = scheduler.animate(() => {
      frames += 1;
      return frames < 2;
    });

    callbacks.shift()!(10);

    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(20);
    await expect(done).resolves.toBeUndefined();
    expect(frames).toBe(2);
    expect(callbacks).toHaveLength(0);
    expect(scheduler.running).toBe(false);
  });
});
