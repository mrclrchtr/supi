import type { SettingItem } from "@mariozechner/pi-tui";
import { createInputSubmenu, registerConfigSettings } from "@mrclrchtr/supi-core";
import { BASH_TIMEOUT_DEFAULTS, type BashTimeoutConfig } from "./config.ts";

export function registerBashTimeoutSettings(): void {
  registerConfigSettings({
    id: "bash-timeout",
    label: "Bash Timeout",
    section: "bash-timeout",
    defaults: BASH_TIMEOUT_DEFAULTS,
    buildItems: (settings) => buildBashTimeoutSettingItems(settings),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      if (settingId === "defaultTimeout") {
        const num = Number.parseInt(value, 10);
        if (Number.isFinite(num) && num > 0) {
          helpers.set("defaultTimeout", num);
        } else {
          helpers.unset("defaultTimeout");
        }
      }
    },
  });
}

function buildBashTimeoutSettingItems(settings: BashTimeoutConfig): SettingItem[] {
  return [
    {
      id: "defaultTimeout",
      label: "Default Timeout",
      description: "Default timeout for bash tool calls in seconds",
      currentValue: String(settings.defaultTimeout),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "Timeout in seconds:", done),
    },
  ];
}
