import { describe, expect, it } from 'vitest';
import { PointerController } from './PointerController';

const hitTest = (x: number): number | null => {
  if (x >= 0 && x < 80) return 0;
  if (x >= 80 && x < 160) return 1;
  return null;
};

describe('PointerController', () => {
  it('reports press immediately and tap on release over the same tube', () => {
    const input = new PointerController(hitTest);
    expect(input.down(7, 20, 20)).toEqual({ kind: 'pressed', tube: 0 });
    expect(input.up(7, 22, 20)).toEqual({ kind: 'tap', tube: 0 });
  });

  it('cancels when movement exceeds twelve CSS pixels', () => {
    const input = new PointerController(hitTest);
    input.down(7, 20, 20);
    expect(input.move(7, 33, 20)).toEqual({ kind: 'canceled', tube: 0 });
    expect(input.up(7, 33, 20)).toEqual({ kind: 'ignored' });
  });

  it('rejects a second pointer until the owner releases', () => {
    const input = new PointerController(hitTest);
    input.down(1, 20, 20);
    expect(input.down(2, 100, 20)).toEqual({ kind: 'ignored' });
    input.up(1, 20, 20);
    expect(input.down(2, 100, 20)).toEqual({ kind: 'pressed', tube: 1 });
  });

  it('stores only the first completed tap while busy', () => {
    const input = new PointerController(hitTest);
    input.setBusy(true);
    input.down(1, 20, 20);
    expect(input.up(1, 20, 20)).toEqual({ kind: 'queued', tube: 0 });
    input.down(2, 100, 20);
    expect(input.up(2, 100, 20)).toEqual({ kind: 'ignored' });
    expect(input.takeQueuedTap()).toBe(0);
    expect(input.takeQueuedTap()).toBeNull();
  });
});
