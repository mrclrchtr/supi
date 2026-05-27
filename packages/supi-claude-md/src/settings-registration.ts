// Claude-MD settings registration for the supi settings registry.

import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import { createInputSubmenu } from "@mrclrchtr/supi-core/settings-ui";
import { CLAUDE_MD_DEFAULTS } from "./config.ts";

// ── Settings registration ────────────────────────────────────

export function registerClaudeMdSettings(): void {
  registerConfigSettings({
    id: "claude-md",
    label: "Claude-MD",
    section: "claude-md",
    defaults: CLAUDE_MD_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "subdirs",
        label: "Subdirectory Discovery",
        description: "Inject CLAUDE.md/AGENTS.md from subdirectories when browsing files",
        currentValue: settings.subdirs ? "on" : "off",
        values: ["on", "off"],
        configType: "boolean" as const,
      },
      {
        id: "fileNames",
        label: "Context File Names",
        description: "File names to look for in each directory (comma-separated)",
        currentValue: settings.fileNames.join(", "),
        configType: "stringList" as const,
        submenu: (currentValue, done) =>
          createInputSubmenu(currentValue, "File names (comma-separated):", done),
      },
    ],
  });
}
