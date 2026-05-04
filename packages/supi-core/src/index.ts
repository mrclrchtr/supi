// supi-core — shared infrastructure for SuPi extensions.
// Provides XML context tag wrapping, unified config system, context-message utilities,
// and settings registry for supi-wide TUI settings.

export type { SupiConfigLocation, SupiConfigOptions } from "./config.ts";
export {
  loadSupiConfig,
  loadSupiConfigForScope,
  removeSupiConfigKey,
  writeSupiConfig,
} from "./config.ts";
export type { ConfigSettingsHelpers, ConfigSettingsOptions } from "./config-settings.ts";
export { registerConfigSettings } from "./config-settings.ts";
export type { ContextMessageLike } from "./context-messages.ts";
export {
  findLastUserMessageIndex,
  getContextToken,
  getPromptContent,
  pruneAndReorderContextMessages,
  restorePromptContent,
} from "./context-messages.ts";
export type { ContextProvider } from "./context-provider-registry.ts";
export {
  clearRegisteredContextProviders,
  getRegisteredContextProviders,
  registerContextProvider,
} from "./context-provider-registry.ts";
export { wrapExtensionContext } from "./context-tag.ts";
export type {
  DebugAgentAccess,
  DebugEvent,
  DebugEventInput,
  DebugEventQuery,
  DebugEventQueryResult,
  DebugEventView,
  DebugLevel,
  DebugNotifyLevel,
  DebugRegistryConfig,
  DebugSummary,
} from "./debug-registry.ts";
export {
  clearDebugEvents,
  configureDebugRegistry,
  DEBUG_REGISTRY_DEFAULTS,
  getDebugEvents,
  getDebugRegistryConfig,
  getDebugSummary,
  recordDebugEvent,
  redactDebugData,
  resetDebugRegistry,
} from "./debug-registry.ts";
export type { KnownRootEntry } from "./project-roots.ts";
export {
  buildKnownRootsMap,
  byPathDepth,
  dedupeTopmostRoots,
  findProjectRoot,
  isWithin,
  isWithinOrEqual,
  mergeKnownRoots,
  resolveKnownRoot,
  segmentCount,
  sortRootsBySpecificity,
  walkProject,
} from "./project-roots.ts";
export { registerSettingsCommand } from "./settings-command.ts";
export type { SettingsScope, SettingsSection } from "./settings-registry.ts";
export {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
} from "./settings-registry.ts";
export { createInputSubmenu, openSettingsOverlay } from "./settings-ui.ts";
