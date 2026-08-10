// supi-core settings domain — settings modules and fixed-config adapters.
export type {
  SettingsActionRequest,
  SettingsApplyResult,
  SettingsCollectionDiagnostic,
  SettingsCollectionResult,
  SettingsContext,
  SettingsContributionCollector,
  SettingsModule,
  SettingsScope,
  SettingsSnapshot,
} from "./settings/settings-registry.ts";
export {
  createSettingsContributionCollector,
  isSettingsContributionCollector,
  registerSettings,
  SUPI_SETTINGS_COLLECT_EVENT,
} from "./settings/settings-registry.ts";
export type {
  BoolField,
  ConfigHelpers,
  ConfigSettingsOptions,
  CustomField,
  EnumField,
  ModelPickerField,
  ModelPickerStaticOption,
  NumberField,
  ScopedFieldValue,
  SettingsAction,
  SettingsField,
  SettingsPersistedChange,
  StringField,
  StringListField,
  ValueSource,
} from "./settings/settings-schema.ts";
export { defineConfigSettings } from "./settings/settings-schema.ts";
