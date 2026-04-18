// supi-core — shared infrastructure for SuPi extensions.
// Provides XML context tag wrapping and unified config system.

export type { SupiConfigLocation, SupiConfigOptions } from "./config.ts";
export { loadSupiConfig, removeSupiConfigKey, writeSupiConfig } from "./config.ts";
export { wrapExtensionContext } from "./context-tag.ts";
