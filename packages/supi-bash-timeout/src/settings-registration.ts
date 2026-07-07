import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerDeclarativeSettings } from "@mrclrchtr/supi-core/settings";
import { BASH_TIMEOUT_DEFAULTS } from "./config.ts";

export function registerBashTimeoutSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerDeclarativeSettings(pi, {
    id: "bash-timeout",
    label: "Bash Timeout",
    section: "bash-timeout",
    defaults: BASH_TIMEOUT_DEFAULTS,
    fields: [
      {
        kind: "number" as const,
        key: "defaultTimeout",
        label: "Default Timeout",
        description: "Default timeout for bash tool calls in seconds",
      },
    ],
    ...(homeDir ? { homeDir } : {}),
  });
}
