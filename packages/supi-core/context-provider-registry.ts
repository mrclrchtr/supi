// Context provider registry for SuPi extensions.
//
// Extensions declare context data providers via `registerContextProvider()` during their
// factory function. The `/supi-context` command reads them via `getRegisteredContextProviders()`.

export interface ContextProvider {
  /** Unique identifier — e.g. "rtk" */
  id: string;
  /** Human-readable label shown in the report */
  label: string;
  /** Return structured data for display, or null when unavailable. */
  getData: () => Record<string, string | number> | null;
}

// Use a globalThis-backed registry so that all jiti module instances
// (resolved through different node_modules symlinks) share the same Map.
const REGISTRY_KEY = Symbol.for("@mrclrchtr/supi-core/context-provider-registry");

function getRegistry(): Map<string, ContextProvider> {
  let registry = (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] as
    | Map<string, ContextProvider>
    | undefined;
  if (!registry) {
    registry = new Map<string, ContextProvider>();
    (globalThis as Record<symbol, unknown>)[REGISTRY_KEY] = registry;
  }
  return registry;
}

/**
 * Register a context data provider for an extension.
 * Call during the extension factory function (not async handlers).
 * Duplicate ids replace the previous registration.
 */
export function registerContextProvider(provider: ContextProvider): void {
  getRegistry().set(provider.id, provider);
}

/** Get all registered context providers in registration order. */
export function getRegisteredContextProviders(): ContextProvider[] {
  return Array.from(getRegistry().values());
}

/** Clear the registry — used by tests. */
export function clearRegisteredContextProviders(): void {
  getRegistry().clear();
}
