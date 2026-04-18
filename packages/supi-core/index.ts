// supi-core — shared infrastructure for SuPi extensions.
// Provides XML context tag wrapping, unified config system, and context-message utilities.

export type { SupiConfigLocation, SupiConfigOptions } from "./config.ts";
export { loadSupiConfig, removeSupiConfigKey, writeSupiConfig } from "./config.ts";
export type { ContextMessageLike } from "./context-messages.ts";
export {
  findLastUserMessageIndex,
  getContextToken,
  pruneAndReorderContextMessages,
} from "./context-messages.ts";
export { wrapExtensionContext } from "./context-tag.ts";
