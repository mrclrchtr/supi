// supi-core config domain — config loading.
export type {
  AutomaticExclusionOptions,
  SupiConfigLocation,
  SupiConfigOptions,
} from "./config/config.ts";
export {
  getSupiConfigPath,
  loadAutomaticExclusionPatterns,
  loadSupiConfig,
  loadSupiConfigForScope,
  loadSupiConfigSectionForScope,
  readJsonFile,
  removeSupiConfigKey,
  replaceSupiConfigSection,
  writeSupiConfig,
} from "./config/config.ts";
