// supi-core settings domain — event-backed declarative settings contributions.
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
export type {
  BoolField,
  ConfigHelpers,
  CustomField,
  DeclarativeSettingsOptions,
  EnumField,
  ModelPickerField,
  ModelPickerStaticOption,
  NumberField,
  ScopedFieldValue,
  SettingsField,
  SettingsFieldAction,
  SettingsPersistedChange,
  StringField,
  StringListField,
  ValueSource,
} from "./settings/settings-schema.ts";
export { registerDeclarativeSettings } from "./settings/settings-schema.ts";
