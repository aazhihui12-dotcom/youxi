const NO_ACTION = Symbol('no-action');

export class PointerOwnershipGate {
  private owner: number | null = null;
  private actionTarget: unknown = NO_ACTION;
  private readonly rejected = new Set<number>();

  begin(pointerId: number): boolean {
    if (this.rejected.has(pointerId)) return false;

    if (this.owner === null) {
      this.owner = pointerId;
      this.actionTarget = NO_ACTION;
      return true;
    }

    if (this.owner === pointerId) return true;

    this.rejected.add(pointerId);
    return false;
  }

  beginAction(pointerId: number, actionTarget: unknown): boolean {
    if (this.rejected.has(pointerId)) return false;

    if (this.owner === null) {
      this.owner = pointerId;
      this.actionTarget = actionTarget;
      return true;
    }

    if (this.owner === pointerId) {
      return this.actionTarget === actionTarget;
    }

    this.rejected.add(pointerId);
    return false;
  }

  canAct(pointerId: number, actionTarget: unknown): boolean {
    return this.owner === pointerId
      && this.actionTarget === actionTarget
      && !this.rejected.has(pointerId);
  }

  release(pointerId: number): void {
    if (this.owner === pointerId) {
      this.owner = null;
      this.actionTarget = NO_ACTION;
    }
    this.rejected.delete(pointerId);
  }
}
