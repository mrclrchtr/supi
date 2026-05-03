// Claude-MD settings registration for the supi settings registry.

import type { SettingItem } from "@mariozechner/pi-tui";
import { Input, Key, matchesKey } from "@mariozechner/pi-tui";
import { type ConfigSettingsHelpers, registerConfigSettings } from "@mrclrchtr/supi-core";
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
    case "rereadInterval": {
      const num = Number.parseInt(value, 10);
      helpers.set("rereadInterval", Number.isNaN(num) ? 0 : num);
      break;
    }
    case "contextThreshold": {
      const num = Number.parseInt(value, 10);
      helpers.set("contextThreshold", Number.isNaN(num) ? 80 : num);
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
      id: "rereadInterval",
      label: "Subdirectory Re-read Interval",
      description: "Turns between re-reading previously injected subdirectory context (0 = off)",
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
