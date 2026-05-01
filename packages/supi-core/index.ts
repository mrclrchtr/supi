// supi-core — shared infrastructure for SuPi extensions.
// Provides XML context tag wrapping, unified config system, context-message utilities,
// and settings registry for supi-wide TUI settings.

export type { SupiConfigLocation, SupiConfigOptions } from "./config.ts";
export { loadSupiConfig, removeSupiConfigKey, writeSupiConfig } from "./config.ts";
export type { ContextMessageLike } from "./context-messages.ts";
export {
  findLastUserMessageIndex,
  getContextToken,
  getPromptContent,
  pruneAndReorderContextMessages,
  restorePromptContent,
} from "./context-messages.ts";
export { wrapExtensionContext } from "./context-tag.ts";
export { registerSettingsCommand } from "./settings-command.ts";
export type { SettingsScope, SettingsSection } from "./settings-registry.ts";
export {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
} from "./settings-registry.ts";
export { openSettingsOverlay } from "./settings-ui.ts";
