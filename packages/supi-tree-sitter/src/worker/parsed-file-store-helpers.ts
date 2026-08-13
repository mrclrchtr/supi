/** Validate fixed positive safe-integer cache limits. */
export function validatePositiveLimits(limits: object): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive safe integer`);
    }
  }
}

/** Promote one Map entry to the most-recent position. */
export function touchEntry<K, V>(entries: Map<K, V>, key: K, value: V): void {
  entries.delete(key);
  entries.set(key, value);
}

/** Delete one WASM resource without interrupting remaining cleanup. */
export function safeDelete(resource: { delete(): void }): void {
  try {
    resource.delete();
  } catch {
    // Continue deterministic cleanup of the remaining owned resources.
  }
}
