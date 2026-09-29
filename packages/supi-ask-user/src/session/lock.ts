// Shared single-form guard for Ask User callers.

export class ActiveQuestionnaireLock {
  private active: boolean = false;

  acquire(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  release(): void {
    this.active = false;
  }
}
