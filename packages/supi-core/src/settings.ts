// supi-core settings domain — event-backed settings contribution types and command wiring.

export { registerSettingsCommand } from "./settings/settings-command.ts";
export type {
  SettingsCollectionDiagnostic,
  SettingsCollectionResult,
  SettingsContributionCollector,
  SettingsScope,
  SettingsSection,
} from "./settings/settings-registry.ts";
export {
  createSettingsContributionCollector,
  isSettingsContributionCollector,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "./settings/settings-registry.ts";
