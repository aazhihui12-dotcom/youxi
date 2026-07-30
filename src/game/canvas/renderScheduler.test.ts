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
});
