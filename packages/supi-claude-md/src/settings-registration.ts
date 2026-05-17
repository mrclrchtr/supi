// Claude-MD settings registration for the supi settings registry.

import type { SettingItem } from "@earendil-works/pi-tui";
import {
  type ConfigSettingsHelpers,
  createInputSubmenu,
  registerConfigSettings,
} from "@mrclrchtr/supi-core";
import { CLAUDE_MD_DEFAULTS, type ClaudeMdConfig } from "./config.ts";

// ── Settings registration ────────────────────────────────────

export function registerClaudeMdSettings(): void {
  registerConfigSettings({
    id: "claude-md",
    label: "Claude-MD",
    section: "claude-md",
    defaults: CLAUDE_MD_DEFAULTS,
    buildItems: (_settings) => buildClaudeMdSettingItems(_settings),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      handleSettingChange(settingId, value, helpers);
    },
  });
}

function handleSettingChange(
  settingId: string,
  value: string,
  helpers: ConfigSettingsHelpers,
): void {
  switch (settingId) {
    case "subdirs": {
      helpers.set("subdirs", value === "on");
      break;
    }
    case "fileNames": {
      const names = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (names.length > 0) {
        helpers.set("fileNames", names);
      } else {
        helpers.unset("fileNames");
      }
      break;
    }
  }
}

function buildClaudeMdSettingItems(settings: ClaudeMdConfig): SettingItem[] {
  return [
    {
      id: "subdirs",
      label: "Subdirectory Discovery",
      description: "Inject CLAUDE.md/AGENTS.md from subdirectories when browsing files",
      currentValue: settings.subdirs ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "fileNames",
      label: "Context File Names",
      description: "File names to look for in each directory (comma-separated)",
      currentValue: settings.fileNames.join(", "),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "File names (comma-separated):", done),
    },
  ];
}
