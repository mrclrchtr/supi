// LSP settings registration for the code-intelligence umbrella extension.
//
// Always-on LSP policy: the global `lsp.enabled` and `lsp.active` keys
// are deprecated and ignored. Per-language disable via
// `lsp.servers.<language>.enabled: false` is the only supported opt-out.
//
// Registered fields:
// - exclude: stringList
// - disabled_servers: custom submenu whose module action writes per-language disable config

import { type ExtensionAPI, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { Component, SettingItem } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@earendil-works/pi-tui";

import { loadSupiConfigSectionForScope, writeSupiConfig } from "@mrclrchtr/supi-core/config";
import {
  defineConfigSettings,
  registerSettings,
  type SettingsScope,
  type ValueSource,
} from "@mrclrchtr/supi-core/settings";
import { type LspSettings, loadConfig } from "@mrclrchtr/supi-lsp/api";

const LSP_DEFAULTS: LspSettings = {
  enabled: true,
  active: [],
  exclude: [],
};

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
  const section = loadSupiConfigSectionForScope("lsp", cwd, {
    scope,
  });
  if (!section) return new Set();
  const servers = section.servers as Record<string, { enabled?: boolean }> | undefined;
  const disabled = new Set<string>();
  if (servers) {
    for (const [name, srv] of Object.entries(servers)) {
      if (srv.enabled === false) disabled.add(name);
    }
  }
  return disabled;
}

function createDisabledServersSubmenu(
  scope: SettingsScope,
  cwd: string,
  done: (selectedValue?: string) => void,
): Component {
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
  container.addChild(new Text("  Disabled Servers — per-language opt-out", 1, 0));

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
  container.addChild(new Text("  esc save and close", 1, 0));

  return {
    render: (width: number) => container.render(width),
    invalidate: () => container.invalidate(),
    handleInput: (data: string) => {
      if (matchesKey(data, Key.escape)) {
        if (!dirty) {
          done();
          return;
        }
        const disabled = items
          .filter((item) => item.currentValue === "disabled")
          .map((item) => item.id);
        done(JSON.stringify(disabled));
        return;
      }
      settingsList.handleInput?.(data);
    },
  };
}

/** Persist the complete disabled-server choice through the settings module action path. */
function persistDisabledServers(
  scope: SettingsScope,
  cwd: string,
  value: string | undefined,
): void {
  const selected = value ? JSON.parse(value) : [];
  if (!Array.isArray(selected) || !selected.every((item) => typeof item === "string")) {
    throw new Error("Invalid disabled-server selection");
  }
  const disabled = new Set<string>(selected);
  const currentSection = loadSupiConfigSectionForScope("lsp", cwd, { scope });
  const servers =
    (currentSection?.servers as Record<string, Record<string, unknown>> | undefined) ?? {};
  const names = new Set([...Object.keys(servers), ...getConfiguredServers(cwd)]);
  for (const name of names) {
    if (disabled.has(name)) {
      servers[name] = { ...(servers[name] ?? {}), enabled: false };
      continue;
    }
    const server = servers[name];
    if (!server) continue;
    delete server.enabled;
    if (Object.keys(server).length === 0) delete servers[name];
  }
  writeSupiConfig({ section: "lsp", scope, cwd }, { servers });
}

export function registerLspSettings(pi: ExtensionAPI): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "lsp",
      label: "LSP",
      section: "lsp",
      defaults: LSP_DEFAULTS,
      fields: [
        {
          kind: "stringList" as const,
          key: "exclude",
          label: "Exclude Patterns",
          description: "Gitignore patterns for automatic LSP workspace work (comma-separated)",
        },
        {
          kind: "custom" as const,
          key: "disabled_servers",
          label: "Disabled Servers",
          description: "Press Enter to choose which language servers to disable",
          resolve: (scope, cwd) => {
            const scopedDisabled = getDisabledServersFromConfig(scope, cwd);
            const otherScope = scope === "project" ? "global" : "project";
            const otherDisabled =
              scope === "project" ? getDisabledServersFromConfig("global", cwd) : new Set<string>();

            // Effective disabled servers = union of both scopes (since either disables)
            const effectiveDisabled = new Set([...scopedDisabled, ...otherDisabled]);
            const label =
              effectiveDisabled.size > 0
                ? [...effectiveDisabled].sort().join(", ")
                : "none disabled";

            // Source: where the override comes from
            let source: ValueSource;
            if (scopedDisabled.size > 0) {
              source = scope;
            } else if (otherDisabled.size > 0) {
              source = otherScope as ValueSource;
            } else {
              source = "default";
            }

            let inheritanceSource: "global" | "default" | undefined;
            if (scope === "project" && source === "project") {
              inheritanceSource =
                getDisabledServersFromConfig("global", cwd).size > 0 ? "global" : "default";
            }

            return { displayValue: label, source, inheritanceSource };
          },
          submenu: (_currentValue, done, scope, cwd) =>
            createDisabledServersSubmenu(scope, cwd, done),
          persist: (scope, cwd, action) =>
            persistDisabledServers(scope, cwd, action.kind === "set" ? action.value : undefined),
        },
      ],
    }),
  );
}
