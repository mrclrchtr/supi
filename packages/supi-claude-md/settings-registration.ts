// Claude-MD settings registration for the supi settings registry.

import type { SettingItem } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import {
  loadSupiConfig,
  registerSettings,
  removeSupiConfigKey,
  type SettingsScope,
  writeSupiConfig,
} from "@mrclrchtr/supi-core";
import { CLAUDE_MD_DEFAULTS, type ClaudeMdConfig } from "./config.ts";

// ── Config helpers ───────────────────────────────────────────

function loadClaudeMdSettings(cwd: string): ClaudeMdConfig {
  return loadSupiConfig("claude-md", cwd, CLAUDE_MD_DEFAULTS);
}

function persistClaudeMdSetting(
  scope: SettingsScope,
  cwd: string,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    removeSupiConfigKey({ section: "claude-md", scope, cwd }, key);
  } else {
    writeSupiConfig({ section: "claude-md", scope, cwd }, { [key]: value });
  }
}

// ── Settings registration ────────────────────────────────────

export function registerClaudeMdSettings(_cwd: string): void {
  registerSettings({
    id: "claude-md",
    label: "Claude-MD",
    loadValues: (scope, _cwd) => buildClaudeMdSettingItems(scope, _cwd),
    persistChange: (scope, _cwd, settingId, value) => {
      if (settingId === "subdirs") {
        persistClaudeMdSetting(scope, _cwd, "subdirs", value === "on");
      } else if (settingId === "rereadInterval") {
        const num = Number.parseInt(value, 10);
        persistClaudeMdSetting(scope, _cwd, "rereadInterval", Number.isNaN(num) ? 0 : num);
      } else if (settingId === "fileNames") {
        const names = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        persistClaudeMdSetting(scope, _cwd, "fileNames", names.length > 0 ? names : undefined);
      }
    },
  });
}

function buildClaudeMdSettingItems(_scope: SettingsScope, cwd: string): SettingItem[] {
  const settings = loadClaudeMdSettings(cwd);

  return [
    {
      id: "subdirs",
      label: "Subdirectory Discovery",
      description: "Inject CLAUDE.md/AGENTS.md from subdirectories when browsing files",
      currentValue: settings.subdirs ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "rereadInterval",
      label: "Context Refresh Interval",
      description: "Turns between re-reading context files (0 = off)",
      currentValue: String(settings.rereadInterval),
      submenu: (currentValue, done) =>
        createInputSubmenu(currentValue, "Interval (0 = off):", done),
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

// ── Input submenu component ──────────────────────────────────

function createInputSubmenu(
  currentValue: string,
  label: string,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const input = new Input();
  input.setValue(currentValue);

  return {
    render: (_width: number) => {
      const lines = [`  ${label}`];
      lines.push(...input.render(_width));
      lines.push("  enter confirm • esc cancel");
      return lines;
    },
    invalidate: () => {
      input.invalidate();
    },
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        done();
        return true;
      }
      if (matchesKey(data, Key.enter)) {
        done(input.getValue());
        return true;
      }
      input.handleInput(data);
      return true;
    },
  };
}
