// LSP settings registration for the supi settings registry.

import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import type { SettingItem } from "@mariozechner/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@mariozechner/pi-tui";
import {
  loadSupiConfig,
  loadSupiConfigForScope,
  registerConfigSettings,
} from "@mrclrchtr/supi-core";
import { loadConfig } from "./config.ts";

// ── Types ────────────────────────────────────────────────────

export interface LspSettings {
  enabled: boolean;
  severity: number;
  active: string[];
}

const LSP_DEFAULTS: LspSettings = {
  enabled: true,
  severity: 1,
  active: [],
};

// ── Config helpers ───────────────────────────────────────────

export function loadLspSettings(cwd: string, homeDir?: string): LspSettings {
  return loadSupiConfig("lsp", cwd, LSP_DEFAULTS, { homeDir });
}

/**
 * Return a user-facing message that indicates which config scope disabled LSP.
 */
export function getLspDisabledMessage(cwd: string, homeDir?: string): string {
  const global = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "global", homeDir });
  const project = loadSupiConfigForScope("lsp", cwd, LSP_DEFAULTS, { scope: "project", homeDir });

  if (project.enabled === false) {
    return "LSP is disabled in project settings (.pi/supi/config.json)";
  }
  if (global.enabled === false) {
    return "LSP is disabled in global settings (~/.pi/agent/supi/config.json)";
  }
  return "LSP is disabled in settings";
}

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

// ── Settings registration ────────────────────────────────────

export function registerLspSettings(): void {
  registerConfigSettings({
    id: "lsp",
    label: "LSP",
    section: "lsp",
    defaults: LSP_DEFAULTS,
    buildItems: (settings, scope, cwd) => buildLspSettingItems(settings, scope, cwd),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      if (settingId === "enabled") {
        helpers.set("enabled", value === "on");
      } else if (settingId === "severity") {
        const num = Number.parseInt(value.split(" ")[0] ?? "1", 10);
        helpers.set("severity", Number.isNaN(num) ? 1 : num);
      } else if (settingId === "active") {
        const active = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        if (active.length > 0) {
          helpers.set("active", active);
        } else {
          helpers.unset("active");
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
  ];
}

// ── Server submenu ───────────────────────────────────────────

function createServerSubmenu(
  _scope: "project" | "global",
  cwd: string,
  settings: LspSettings,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const config = loadConfig(cwd);
  const allServers = Object.keys(config.servers);
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
    () => {
      // Escape on inner SettingsList — no-op, handled by submenu wrapper
    },
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
