// Shared registry utility for SuPi extensions.
//
// Provides a globalThis-backed registry pattern so that all jiti module instances
// (resolved through different node_modules symlinks) share the same Map.
// Without this, each symlink path gets its own module copy and its own Map,
// so registrations from one instance are invisible to consumers in another.

import * as path from "node:path";

const SYMBOL_PREFIX = "@mrclrchtr/supi-core/";

function getGlobalRegistryMap<T>(name: string): Map<string, T> {
  const key = Symbol.for(SYMBOL_PREFIX + name);
  let map = (globalThis as Record<symbol, unknown>)[key] as Map<string, T> | undefined;
  if (!map) {
    map = new Map<string, T>();
    (globalThis as Record<symbol, unknown>)[key] = map;
  }
  return map;
}

/**
 * Create a named registry backed by `globalThis` + `Symbol.for`.
 *
 * The registry is lazily initialized on first access and shared across all
 * jiti module instances via the global symbol namespace.
 *
 * @typeParam T - The value type stored in the registry.
 * @param name - Unique registry name (used to construct the `Symbol.for` key).
 * @returns An object with `register`, `unregister`, `getAll`, and `clear` functions.
 */
export function createRegistry<T>(name: string) {
  const getMap = (): Map<string, T> => getGlobalRegistryMap<T>(name);

  return {
    /**
     * Register a value by id. Duplicate ids silently replace the previous registration.
     */
    register: (id: string, value: T): void => {
      getMap().set(id, value);
    },

    /**
     * Remove a registration by id. No-op if not registered.
     */
    unregister: (id: string): void => {
      getMap().delete(id);
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

/**
 * Create a named session-state registry keyed by normalized cwd.
 *
 * This helper is intended for session-scoped runtime services that should be
 * shared across duplicate jiti module instances while keeping package-specific
 * state unions and convenience wrappers local to the calling package.
 */
export function createSessionStateRegistry<TState>(name: string) {
  const getMap = (): Map<string, TState> => getGlobalRegistryMap<TState>(name);
  const normalizeCwd = (cwd: string): string => path.resolve(cwd);

  return {
    /** Get the current state for one session cwd. */
    get: (cwd: string): TState | undefined => {
      return getMap().get(normalizeCwd(cwd));
    },

    /** Store the current state for one session cwd. */
    set: (cwd: string, state: TState): void => {
      getMap().set(normalizeCwd(cwd), state);
    },

    /** Clear the current state for one session cwd. */
    clear: (cwd: string): void => {
      getMap().delete(normalizeCwd(cwd));
    },
  };
}
