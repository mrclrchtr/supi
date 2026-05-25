// supi-core config domain — config loading and config-settings helpers.
export type { SupiConfigLocation, SupiConfigOptions } from "./config/config.ts";
export {
  loadSupiConfig,
  loadSupiConfigForScope,
  readJsonFile,
  removeSupiConfigKey,
  writeSupiConfig,
} from "./config/config.ts";
export type { ConfigSettingsHelpers, ConfigSettingsOptions } from "./config/config-settings.ts";
export { registerConfigSettings } from "./config/config-settings.ts";
