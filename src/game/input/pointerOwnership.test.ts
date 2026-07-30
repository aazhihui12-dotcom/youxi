import { describe, expect, it } from 'vitest';

import { PointerOwnershipGate } from './pointerOwnership';

describe('PointerOwnershipGate', () => {
  it('allows only the owner action when tube and control pointers overlap', () => {
    const gate = new PointerOwnershipGate();

    expect(gate.beginAction(1, 'tube')).toBe(true);
    expect(gate.beginAction(2, 'undo')).toBe(false);
    expect(gate.beginAction(3, 'restart')).toBe(false);

    expect([
      gate.canAct(1, 'tube') ? 'tube' : null,
      gate.canAct(2, 'undo') ? 'undo' : null,
      gate.canAct(3, 'restart') ? 'restart' : null,
    ].filter(Boolean)).toEqual(['tube']);
  });

  it('keeps a rejected pointer blocked after the owner releases', () => {
    const gate = new PointerOwnershipGate();

    gate.beginAction(1, 'tube');
    expect(gate.beginAction(2, 'undo')).toBe(false);

    gate.release(1);
    expect(gate.canAct(2, 'undo')).toBe(false);

    gate.release(2);
    expect(gate.beginAction(2, 'undo')).toBe(true);
    expect(gate.canAct(2, 'undo')).toBe(true);
  });

  it.each(['up', 'cancel', 'outside'])(
    'releases ownership on pointer %s without leaving the gate stuck',
    () => {
      const gate = new PointerOwnershipGate();

      gate.beginAction(4, 'tube');
      gate.release(4);

      expect(gate.beginAction(5, 'restart')).toBe(true);
      expect(gate.canAct(5, 'restart')).toBe(true);
    },
  );

  it('releasing a rejected pointer does not release the owner', () => {
    const gate = new PointerOwnershipGate();

    gate.beginAction(1, 'tube');
    gate.beginAction(2, 'undo');
    gate.release(2);

    expect(gate.canAct(1, 'tube')).toBe(true);
    expect(gate.canAct(2, 'undo')).toBe(false);
  });

  it('requires pointer up to match the action target accepted on down', () => {
    const gate = new PointerOwnershipGate();

    gate.beginAction(1, 'sound');

    expect(gate.canAct(1, 'restart')).toBe(false);
    expect(gate.canAct(1, 'sound')).toBe(true);
  });

  it('lets a background pointer own the scene without owning an action', () => {
    const gate = new PointerOwnershipGate();

    expect(gate.begin(1)).toBe(true);
    expect(gate.beginAction(2, 'tube')).toBe(false);
    expect(gate.canAct(1, 'tube')).toBe(false);
    expect(gate.canAct(2, 'tube')).toBe(false);
  });
});
