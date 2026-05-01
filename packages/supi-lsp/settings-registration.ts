// LSP settings registration for the supi settings registry.

import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import type { SettingItem } from "@mariozechner/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@mariozechner/pi-tui";
import {
  loadSupiConfig,
  registerSettings,
  removeSupiConfigKey,
  type SettingsScope,
  writeSupiConfig,
} from "@mrclrchtr/supi-core";
import { loadConfig } from "./config.ts";

// ── Types ────────────────────────────────────────────────────

export interface LspSettings {
  enabled: boolean;
  severity: number;
  servers: string[];
}

const LSP_DEFAULTS: LspSettings = {
  enabled: true,
  severity: 1,
  servers: [],
};

// ── Config helpers ───────────────────────────────────────────

export function loadLspSettings(cwd: string): LspSettings {
  return loadSupiConfig("lsp", cwd, LSP_DEFAULTS);
}

function persistLspSetting(scope: SettingsScope, cwd: string, key: string, value: unknown): void {
  if (value === undefined) {
    removeSupiConfigKey({ section: "lsp", scope, cwd }, key);
  } else {
    writeSupiConfig({ section: "lsp", scope, cwd }, { [key]: value });
  }
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

export function registerLspSettings(_cwd: string): void {
  registerSettings({
    id: "lsp",
    label: "LSP",
    loadValues: (_scope, _cwd) => buildLspSettingItems(_scope, _cwd),
    persistChange: (scope, cwd, settingId, value) => {
      if (settingId === "enabled") {
        persistLspSetting(scope, cwd, "enabled", value === "on");
      } else if (settingId === "severity") {
        const num = Number.parseInt(value.split(" ")[0] ?? "1", 10);
        persistLspSetting(scope, cwd, "severity", Number.isNaN(num) ? 1 : num);
      } else if (settingId === "servers") {
        const servers = value
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);
        persistLspSetting(scope, cwd, "servers", servers.length > 0 ? servers : undefined);
      }
    },
  });
}

function buildLspSettingItems(_scope: SettingsScope, cwd: string): SettingItem[] {
  const settings = loadLspSettings(cwd);

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
      id: "servers",
      label: "Active Servers",
      description: "Press Enter to configure which language servers are active",
      currentValue: settings.servers.length > 0 ? settings.servers.join(", ") : "all",
      submenu: (_currentValue, done) => createServerSubmenu(cwd, done),
    },
  ];
}

// ── Server submenu ───────────────────────────────────────────

function createServerSubmenu(
  cwd: string,
  done: (selectedValue?: string) => void,
): {
  render: (width: number) => string[];
  invalidate: () => void;
  handleInput: (data: string) => boolean;
} {
  const config = loadConfig(cwd);
  const settings = loadLspSettings(cwd);
  const allServers = Object.keys(config.servers);
  const allEnabled = settings.servers.length === 0;
  const enabledServers = new Set(settings.servers);

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
