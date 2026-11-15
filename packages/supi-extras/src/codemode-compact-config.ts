import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadSupiConfig } from "@mrclrchtr/supi-core/config";
import { defineConfigSettings, registerSettings } from "@mrclrchtr/supi-core/settings";

/** Config section `codemode-view` in SuPi config files. */
export interface CodemodeViewConfig extends Record<string, unknown> {
  /** Show compact collapsed rows for Pi's codemode tool. */
  compact: boolean;
}

export const CODEMODE_VIEW_DEFAULTS: CodemodeViewConfig = { compact: true };

export function loadCodemodeViewConfig(cwd: string, homeDir?: string): CodemodeViewConfig {
  const raw = loadSupiConfig("codemode-view", cwd, CODEMODE_VIEW_DEFAULTS, { homeDir });
  return {
    compact: typeof raw.compact === "boolean" ? raw.compact : CODEMODE_VIEW_DEFAULTS.compact,
  };
}

export function registerCodemodeViewSettings(pi: ExtensionAPI, afterPersist: () => void): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "codemode-view",
      label: "Codemode View",
      section: "codemode-view",
      defaults: CODEMODE_VIEW_DEFAULTS,
      fields: [
        {
          kind: "boolean",
          key: "compact",
          label: "Compact rows",
          description:
            "Collapse codemode rows to a summary; expand tool output to see the full view",
        },
      ],
      afterPersist,
    }),
  );
}
