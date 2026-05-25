// LSP settings registration for the supi-code-intelligence umbrella.
//
// Ported from supi-lsp's settings-registration.ts.

import { CONFIG_DIR_NAME, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@earendil-works/pi-tui";
import { registerConfigSettings } from "@mrclrchtr/supi-core/config";
import {
  getLspDisabledMessage,
  type LspSettings,
  loadConfig,
  loadLspSettings,
} from "@mrclrchtr/supi-lsp/api";

const LSP_DEFAULTS: LspSettings = {
  enabled: true,
  severity: 1,
  active: [],
  exclude: [],
};

function severityLabel(severity: number): string {
  switch (severity) {
    case 1:
      return "errors";
    case 2:
      return "warnings";
    case 3:
      return "info";
    case 4:
      return "hints";
    default:
      return "errors";
  }
}

/** Discover configured servers from the workspace LSP config. */
function getConfiguredServers(cwd: string): string[] {
  try {
    const config = loadConfig(cwd);
    return Object.keys(config.servers ?? {});
  } catch {
    return ["typescript"];
  }
}

export function registerLspSettings(): void {
  registerConfigSettings({
    id: "lsp",
    label: "LSP",
    section: "lsp",
    defaults: LSP_DEFAULTS,
    buildItems: (settings, scope, cwd) => buildLspSettingItems(settings, scope, cwd),
    // biome-ignore lint/complexity/useMaxParams: registerConfigSettings callback signature
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      switch (settingId) {
        case "enabled":
          helpers.set("enabled", value === "on");
          break;
        case "severity": {
          const num = Number.parseInt(value.split(" ")[0] ?? "1", 10);
          helpers.set("severity", Number.isNaN(num) ? 1 : num);
          break;
        }
        case "active": {
          const active = value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (active.length > 0) helpers.set("active", active);
          else helpers.unset("active");
          break;
        }
        case "exclude": {
          const patterns = value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          if (patterns.length > 0) helpers.set("exclude", patterns);
          else helpers.unset("exclude");
          break;
        }
      }
    },
  });
}

function buildLspSettingItems(
  settings: LspSettings,
  scope: "project" | "global",
  cwd: string,
): SettingItem[] {
  return [
    {
      id: "enabled",
      label: "Enable LSP",
      description: "Enable or disable all LSP functionality",
      currentValue: settings.enabled ? "on" : "off",
      values: ["on", "off"],
    },
    {
      id: "severity",
      label: "Inline Severity",
      description: "Minimum diagnostic severity to show inline (1=errors, 4=hints)",
      currentValue: `${settings.severity} (${severityLabel(settings.severity)})`,
      values: ["1 (errors)", "2 (warnings)", "3 (info)", "4 (hints)"],
    },
    {
      id: "active",
      label: "Active Servers",
      description: "Press Enter to configure which language servers are active",
      currentValue: settings.active.length > 0 ? settings.active.join(", ") : "all",
      submenu: (_currentValue, done) => createServerSubmenu(scope, cwd, settings, done),
    },
    {
      id: "exclude",
      label: "Exclude Patterns",
      description: "Gitignore patterns to suppress LSP diagnostics",
      currentValue: settings.exclude.length > 0 ? settings.exclude.join(", ") : "none",
      submenu: (_currentValue, done) => createExcludeSubmenu(scope, cwd, settings, done),
    },
  ];
}

function createServerSubmenu(
  _scope: "project" | "global",
  cwd: string,
  settings: LspSettings,
  done: (value?: string) => void,
) {
  const allServers = getConfiguredServers(cwd);
  const allEnabled = settings.active.length === 0;
  const enabledServers = new Set(settings.active);

  const items: SettingItem[] = allServers.map((name) => ({
    id: name,
    label: name,
    currentValue: allEnabled || enabledServers.has(name) ? "enabled" : "disabled",
    values: ["enabled", "disabled"],
  }));

  let dirty = false;
  const container = new Container();
  const header = new Text("Active Servers — all enabled by default", 0, 0);
  container.addChild(header);

  const settingsList = new SettingsList(
    items,
    Math.min(items.length + 2, 15),
    getSettingsListTheme(),
    (id, newValue) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx >= 0 && items[idx].currentValue !== newValue) {
        dirty = true;
        items[idx].currentValue = newValue;
      }
    },
    () => {},
    { enableSearch: true },
  );
  container.addChild(settingsList);

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        if (!dirty) {
          done();
          return true;
        }
        const enabled = items.filter((i) => i.currentValue === "enabled").map((i) => i.id);
        done(enabled.join(", ") || undefined);
        return true;
      }
      settingsList.handleInput?.(data);
      return true;
    },
  };
}

function createExcludeSubmenu(
  _scope: "project" | "global",
  _cwd: string,
  settings: LspSettings,
  done: (value?: string) => void,
) {
  const items: SettingItem[] = settings.exclude.map((pattern) => ({
    id: pattern,
    label: pattern,
    currentValue: "enabled",
    values: ["enabled", "disabled"],
  }));

  let dirty = false;
  const container = new Container();
  const header = new Text("Exclude Patterns — toggle off to remove", 0, 0);
  container.addChild(header);

  const footer = new Text(
    `Add new patterns in ${CONFIG_DIR_NAME}/supi/config.json under lsp.exclude`,
    0,
    0,
  );
  container.addChild(footer);

  const settingsList = new SettingsList(
    items,
    Math.min(items.length + 3, 15),
    getSettingsListTheme(),
    (id, newValue) => {
      const idx = items.findIndex((i) => i.id === id);
      if (idx >= 0 && items[idx].currentValue !== newValue) {
        dirty = true;
        items[idx].currentValue = newValue;
      }
    },
    () => {},
  );
  container.addChild(settingsList);

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        if (!dirty) {
          done();
          return true;
        }
        const enabled = items.filter((i) => i.currentValue === "enabled").map((i) => i.id);
        done(enabled.join(", ") || undefined);
        return true;
      }
      settingsList.handleInput?.(data);
      return true;
    },
  };
}

export { getLspDisabledMessage, loadLspSettings };
