// supi-core config domain — config loading.
export type { SupiConfigLocation, SupiConfigOptions } from "./config/config.ts";
export {
  loadSectionConfig,
  loadSupiConfig,
  loadSupiConfigForScope,
  loadSupiConfigSectionForScope,
  readJsonFile,
  removeSupiConfigKey,
  writeSupiConfig,
} from "./config/config.ts";
