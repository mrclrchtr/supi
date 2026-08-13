// supi-core config domain — config loading.
export type { SupiConfigLocation, SupiConfigOptions } from "./config/config.ts";
export {
  getSupiConfigPath,
  loadSupiConfig,
  loadSupiConfigForScope,
  loadSupiConfigSectionForScope,
  readJsonFile,
  removeSupiConfigKey,
  replaceSupiConfigSection,
  writeSupiConfig,
} from "./config/config.ts";
