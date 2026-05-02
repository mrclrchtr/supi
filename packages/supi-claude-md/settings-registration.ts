// Claude-MD settings registration for the supi settings registry.

import type { SettingItem } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import {
  loadSupiConfigForScope,
  registerSettings,
  removeSupiConfigKey,
  type SettingsScope,
  writeSupiConfig,
} from "@mrclrchtr/supi-core";
import { CLAUDE_MD_DEFAULTS, type ClaudeMdConfig } from "./config.ts";

const THRESHOLD_VALUES = [
  "0",
  "5",
  "10",
  "15",
  "20",
  "25",
  "30",
  "35",
  "40",
  "45",
  "50",
  "55",
  "60",
  "65",
  "70",
  "75",
  "80",
  "85",
  "90",
  "95",
  "100",
];

// ── Config helpers ───────────────────────────────────────────

function loadClaudeMdSettings(scope: SettingsScope, cwd: string): ClaudeMdConfig {
  return loadSupiConfigForScope("claude-md", cwd, CLAUDE_MD_DEFAULTS, { scope });
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

export function registerClaudeMdSettings(): void {
  registerSettings({
    id: "claude-md",
    label: "Claude-MD",
    loadValues: (scope, cwd) => buildClaudeMdSettingItems(scope, cwd),
    persistChange: (scope, cwd, settingId, value) => {
      handleSettingChange(scope, cwd, settingId, value);
    },
  });
}

function handleSettingChange(
  scope: SettingsScope,
  cwd: string,
  settingId: string,
  value: string,
): void {
  switch (settingId) {
    case "subdirs": {
      persistClaudeMdSetting(scope, cwd, "subdirs", value === "on");
      break;
    }
    case "rereadInterval": {
      const num = Number.parseInt(value, 10);
      persistClaudeMdSetting(scope, cwd, "rereadInterval", Number.isNaN(num) ? 0 : num);
      break;
    }
    case "contextThreshold": {
      const num = Number.parseInt(value, 10);
      persistClaudeMdSetting(scope, cwd, "contextThreshold", Number.isNaN(num) ? 80 : num);
      break;
    }
    case "fileNames": {
      const names = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      persistClaudeMdSetting(scope, cwd, "fileNames", names.length > 0 ? names : undefined);
      break;
    }
  }
}

function buildClaudeMdSettingItems(scope: SettingsScope, cwd: string): SettingItem[] {
  const settings = loadClaudeMdSettings(scope, cwd);

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
      id: "contextThreshold",
      label: "Context Threshold",
      description: "Skip injection when context window usage % ≥ threshold (100 = never skip)",
      currentValue: String(settings.contextThreshold),
      values: THRESHOLD_VALUES,
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
