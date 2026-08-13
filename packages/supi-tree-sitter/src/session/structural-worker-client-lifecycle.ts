interface OwnedWorkerLike {
  terminate(): Promise<number>;
}

/** Serialize every Worker start, termination, and restart ownership transition. */
export class StructuralWorkerLifecycle {
  #transition = Promise.resolve();
  #generation = 0;

  /** Run one transition after every older transition settles. */
  run<T>(operation: () => Promise<T>): Promise<T> {
    const generation = this.#generation;
    const current = this.#transition.then(
      () => this.#runIfCurrent(generation, operation),
      () => this.#runIfCurrent(generation, operation),
    );
    this.#transition = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  }

  /** Terminate one Worker as part of the serialized transition fence. */
  async terminate(worker: OwnedWorkerLike | null): Promise<void> {
    this.#generation += 1;
    if (worker) await worker.terminate().catch(() => 0);
  }

  /** Await every transition admitted before this call. */
  settled(): Promise<void> {
    return this.#transition;
  }

  async #runIfCurrent<T>(generation: number, operation: () => Promise<T>): Promise<T> {
    if (generation !== this.#generation) throw new Error("Structural Worker lifecycle superseded");
    return operation();
  }
}
