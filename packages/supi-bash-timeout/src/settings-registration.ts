import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import { createInputSubmenu } from "@mrclrchtr/supi-core/settings-ui";
import { BASH_TIMEOUT_DEFAULTS } from "./config.ts";

export function registerBashTimeoutSettings(): void {
  registerConfigSettings({
    id: "bash-timeout",
    label: "Bash Timeout",
    section: "bash-timeout",
    defaults: BASH_TIMEOUT_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "defaultTimeout",
        label: "Default Timeout",
        description: "Default timeout for bash tool calls in seconds",
        currentValue: String(settings.defaultTimeout),
        configType: "number" as const,
        submenu: (currentValue, done) =>
          createInputSubmenu(currentValue, "Timeout in seconds:", done),
      },
    ],
  });
}
