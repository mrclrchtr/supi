// Context provider registry for SuPi extensions.
//
// Extensions declare context data providers via `registerContextProvider()` during their
// factory function. The `/supi-context` command reads them via `getRegisteredContextProviders()`.

import { createRegistry } from "./registry-utils.ts";

export interface ContextProvider {
  /** Unique identifier — e.g. "rtk" */
  id: string;
  /** Human-readable label shown in the report */
  label: string;
  /** Return structured data for display, or null when unavailable. */
  getData: () => Record<string, string | number> | null;
}

const registry = createRegistry<ContextProvider>("context-provider-registry");

/**
 * Register a context data provider for an extension.
 * Call during the extension factory function (not async handlers).
 * Duplicate ids replace the previous registration.
 */
export function registerContextProvider(provider: ContextProvider): void {
  registry.register(provider.id, provider);
}

/** Get all registered context providers in registration order. */
export function getRegisteredContextProviders(): ContextProvider[] {
  return registry.getAll();
}

/** Clear the registry — used by tests. */
export function clearRegisteredContextProviders(): void {
  registry.clear();
}
