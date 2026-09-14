import { readFileSync } from "node:fs";

type PendingRead = {
  filePath: string;
  resolve: (content: string) => void;
};

type ReadWaiter = {
  count: number;
  resolve: () => void;
};

/** Hold test file reads until the caller releases them. */
export class ControlledReads {
  readonly calls: string[] = [];
  activeReads = 0;
  maximumActiveReads = 0;
  #autoResolve = false;
  #pending: PendingRead[] = [];
  #waiters: ReadWaiter[] = [];

  read(filePath: string): Promise<string> {
    this.calls.push(filePath);
    this.activeReads++;
    this.maximumActiveReads = Math.max(this.maximumActiveReads, this.activeReads);
    const result = new Promise<string>((resolve) => {
      this.#pending.push({ filePath, resolve });
      this.#notifyCallWaiters();
    });
    if (this.#autoResolve) queueMicrotask(() => this.resolveAll());
    return result;
  }

  enableAutoResolve(): void {
    this.#autoResolve = true;
    this.resolveAll();
  }

  waitForCalls(count: number): Promise<void> {
    if (this.calls.length >= count) return Promise.resolve();
    return new Promise((resolve) => {
      this.#waiters.push({ count, resolve });
    });
  }

  resolveAll(): void {
    const pending = this.#pending.splice(0);
    for (const read of pending) {
      this.activeReads--;
      read.resolve(readFileSync(read.filePath, "utf-8"));
    }
  }

  #notifyCallWaiters(): void {
    const ready = this.#waiters.filter((waiter) => this.calls.length >= waiter.count);
    this.#waiters = this.#waiters.filter((waiter) => this.calls.length < waiter.count);
    for (const waiter of ready) waiter.resolve();
  }
}
