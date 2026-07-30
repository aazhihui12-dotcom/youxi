import { describe, expect, it, vi } from 'vitest';

import { SoundController } from './SoundController';

type ContextFactory = () => AudioContext;

function createController(
  enabled: boolean,
  contextFactory: ContextFactory,
): SoundController {
  return new SoundController(enabled, contextFactory);
}

async function expectSafeDispose(controller: SoundController): Promise<void> {
  await expect(controller.dispose()).resolves.toBeUndefined();
}

describe('SoundController disposal', () => {
  it('is safe before an audio context has been created', async () => {
    const contextFactory = vi.fn<ContextFactory>();
    const controller = createController(false, contextFactory);

    await expectSafeDispose(controller);

    expect(contextFactory).not.toHaveBeenCalled();
  });

  it('closes a created audio context only once across repeated disposal', async () => {
    const close = vi.fn(async () => undefined);
    const context = {
      state: 'closed',
      close,
    } as unknown as AudioContext;
    const controller = createController(true, () => context);
    controller.play('select');

    await expectSafeDispose(controller);
    await expectSafeDispose(controller);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('swallows an audio context close failure', async () => {
    const context = {
      state: 'closed',
      close: vi.fn(async () => {
        throw new Error('device disappeared');
      }),
    } as unknown as AudioContext;
    const controller = createController(true, () => context);
    controller.play('select');

    await expectSafeDispose(controller);
  });
});
