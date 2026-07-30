const MOVE_TOLERANCE = 12;

export type PointerResult =
  | { kind: 'pressed'; tube: number }
  | { kind: 'tap'; tube: number }
  | { kind: 'queued'; tube: number }
  | { kind: 'canceled'; tube: number | null }
  | { kind: 'ignored' };

interface ActivePointer {
  id: number;
  tube: number;
  startX: number;
  startY: number;
  canceled: boolean;
}

export class PointerController {
  private active: ActivePointer | null = null;
  private busy = false;
  private queuedTap: number | null = null;

  constructor(private readonly hitTest: (x: number, y: number) => number | null) {}

  setBusy(busy: boolean): void {
    this.busy = busy;
  }

  down(pointerId: number, x: number, y: number): PointerResult {
    if (this.active !== null) return { kind: 'ignored' };

    const tube = this.hitTest(x, y);
    if (tube === null) return { kind: 'ignored' };

    this.active = { id: pointerId, tube, startX: x, startY: y, canceled: false };
    return { kind: 'pressed', tube };
  }

  move(pointerId: number, x: number, y: number): PointerResult {
    if (this.active?.id !== pointerId || this.active.canceled) {
      return { kind: 'ignored' };
    }

    if (Math.hypot(x - this.active.startX, y - this.active.startY) <= MOVE_TOLERANCE) {
      return { kind: 'ignored' };
    }

    this.active.canceled = true;
    return { kind: 'canceled', tube: this.active.tube };
  }

  up(pointerId: number, x: number, y: number): PointerResult {
    if (this.active?.id !== pointerId) return { kind: 'ignored' };

    const active = this.active;
    this.active = null;
    if (active.canceled) return { kind: 'ignored' };

    if (this.hitTest(x, y) !== active.tube) {
      return { kind: 'canceled', tube: active.tube };
    }

    if (this.busy) {
      if (this.queuedTap !== null) return { kind: 'ignored' };

      this.queuedTap = active.tube;
      return { kind: 'queued', tube: active.tube };
    }

    return { kind: 'tap', tube: active.tube };
  }

  cancel(pointerId: number): PointerResult {
    if (this.active?.id !== pointerId) return { kind: 'ignored' };

    const tube = this.active.tube;
    this.active = null;
    return { kind: 'canceled', tube };
  }

  takeQueuedTap(): number | null {
    const tube = this.queuedTap;
    this.queuedTap = null;
    return tube;
  }

  reset(): void {
    this.active = null;
    this.queuedTap = null;
    this.busy = false;
  }
}
