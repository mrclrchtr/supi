// Session-scoped single-active interaction guard for ask_user.

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

  isActive(): boolean {
    return this.active;
  }
}
