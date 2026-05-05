// Shared registry utility for SuPi extensions.
//
// Provides a globalThis-backed registry pattern so that all jiti module instances
// (resolved through different node_modules symlinks) share the same Map.
// Without this, each symlink path gets its own module copy and its own Map,
// so registrations from one instance are invisible to consumers in another.

const SYMBOL_PREFIX = "@mrclrchtr/supi-core/";

/**
 * Create a named registry backed by `globalThis` + `Symbol.for`.
 *
 * The registry is lazily initialized on first access and shared across all
 * jiti module instances via the global symbol namespace.
 *
 * @typeParam T - The value type stored in the registry.
 * @param name - Unique registry name (used to construct the `Symbol.for` key).
 * @returns An object with `register`, `getAll`, and `clear` functions.
 */
export function createRegistry<T>(name: string) {
  const key = Symbol.for(SYMBOL_PREFIX + name);

  const getMap = (): Map<string, T> => {
    let map = (globalThis as Record<symbol, unknown>)[key] as Map<string, T> | undefined;
    if (!map) {
      map = new Map<string, T>();
      (globalThis as Record<symbol, unknown>)[key] = map;
    }
    return map;
  };

  return {
    /**
     * Register a value by id. Duplicate ids silently replace the previous registration.
     */
    register: (id: string, value: T): void => {
      getMap().set(id, value);
    },

    /**
     * Get all registered values in registration order.
     */
    getAll: (): T[] => {
      return Array.from(getMap().values());
    },

    /**
     * Clear all entries from the registry (primarily for tests).
     */
    clear: (): void => {
      getMap().clear();
    },
  };
}
