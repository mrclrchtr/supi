// supi-core settings domain — settings registry (lightweight, type-only pi-tui import).

export { registerSettingsCommand } from "./settings/settings-command.ts";
export type { SettingsScope, SettingsSection } from "./settings/settings-registry.ts";
export {
  clearRegisteredSettings,
  getRegisteredSettings,
  registerSettings,
} from "./settings/settings-registry.ts";
