// LSP settings registration for the code-intelligence umbrella extension.
//
// Always-on LSP policy: the global `lsp.enabled` and `lsp.active` keys
// are deprecated and ignored. Per-language disable via
// `lsp.servers.<language>.enabled: false` is the only supported opt-out.
//
// This settings section provides:
// - severity control
// - excluded patterns
// - a "Disabled Servers" submenu that writes per-language disable config

import { CONFIG_DIR_NAME, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@earendil-works/pi-tui";

type SettingsScope = "project" | "global";

import {
  loadSupiConfigForScope,
  registerConfigSettings,
  writeSupiConfig,
} from "@mrclrchtr/supi-core/config";
import { type LspSettings, loadConfig } from "@mrclrchtr/supi-lsp/api";

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

/** Discover configured servers from the defaults + effective LSP config. */
function getConfiguredServers(cwd: string): string[] {
  try {
    const config = loadConfig(cwd);
    return Object.keys(config.servers);
  } catch {
    return ["typescript"];
  }
}

/**
 * Load the raw LSP section for a single scope to inspect the currently
 * configured disabled servers from the persisted config.
 */
function getDisabledServersFromConfig(scope: SettingsScope, cwd: string): Set<string> {
  const section = loadSupiConfigForScope(
    "lsp",
    cwd,
    { servers: {} as Record<string, { enabled?: boolean }> },
    { scope },
  );
  const servers = section.servers as Record<string, { enabled?: boolean }> | undefined;
  const disabled = new Set<string>();
  if (servers) {
    for (const [name, srv] of Object.entries(servers)) {
      if (srv.enabled === false) disabled.add(name);
    }
  }
  return disabled;
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
        case "severity": {
          const num = Number.parseInt(value.split(" ")[0] ?? "1", 10);
          helpers.set("severity", Number.isNaN(num) ? 1 : num);
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
      id: "severity",
      label: "Inline Severity",
      description: "Minimum diagnostic severity to show inline (1=errors, 4=hints)",
      currentValue: `${settings.severity} (${severityLabel(settings.severity)})`,
      values: ["1 (errors)", "2 (warnings)", "3 (info)", "4 (hints)"],
    },
    {
      id: "disabled_servers",
      label: "Disabled Servers",
      description: "Press Enter to choose which language servers to disable",
      currentValue: renderDisabledServersLabel(scope, cwd),
      submenu: (_currentValue, done) => createDisabledServersSubmenu(scope, cwd, done),
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

function renderDisabledServersLabel(scope: SettingsScope, cwd: string): string {
  const disabled = getDisabledServersFromConfig(scope, cwd);
  return disabled.size > 0 ? [...disabled].sort().join(", ") : "none disabled";
}

function createDisabledServersSubmenu(
  scope: SettingsScope,
  cwd: string,
  done: (value?: string) => void,
) {
  const allServers = getConfiguredServers(cwd);
  const disabledServers = getDisabledServersFromConfig(scope, cwd);

  const items: SettingItem[] = allServers.map((name) => ({
    id: name,
    label: name,
    currentValue: disabledServers.has(name) ? "disabled" : "enabled",
    values: ["enabled", "disabled"],
  }));

  let dirty = false;
  const container = new Container();
  const header = new Text("Disabled Servers — per-language opt-out", 0, 0);
  container.addChild(header);
  const footer = new Text(
    "Marking a server as disabled writes lsp.servers.<lang>.enabled: false for this scope",
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
    { enableSearch: true },
  );
  container.addChild(settingsList);

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: single event handler dispatching keyboard shortcuts for the Disabled Servers submenu
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        if (!dirty) {
          done();
          return true;
        }
        // Write per-language enabled/disabled into lsp.servers
        const currentSection = loadSupiConfigForScope(
          "lsp",
          cwd,
          { servers: {} as Record<string, { enabled?: boolean }> },
          { scope },
        );
        const servers =
          (currentSection.servers as Record<string, Record<string, unknown>> | undefined) ?? {};

        for (const item of items) {
          if (item.currentValue === "disabled") {
            servers[item.id] = { ...(servers[item.id] ?? {}), enabled: false };
          } else {
            const srv = servers[item.id];
            if (srv) {
              delete srv.enabled;
              // If only `enabled` was the property, remove the whole entry
              if (Object.keys(srv).length === 0) {
                delete servers[item.id];
              }
            }
          }
        }

        writeSupiConfig({ section: "lsp", scope, cwd }, { servers });
        done();
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
