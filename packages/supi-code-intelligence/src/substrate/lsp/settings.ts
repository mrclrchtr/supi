// LSP settings registration for the code-intelligence umbrella extension.
//
// Per-language disable via `lsp.servers.<language>.enabled: false` is the
// supported opt-out.
//
// Registered fields:
// - disabled_servers: custom submenu whose module action writes per-language enablement config

import { type ExtensionAPI, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { Component, SettingItem } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@earendil-works/pi-tui";

import {
  loadSupiConfigSectionForScope,
  replaceSupiConfigSection,
} from "@mrclrchtr/supi-core/config";
import {
  defineConfigSettings,
  registerSettings,
  type SettingsScope,
} from "@mrclrchtr/supi-core/settings";
import { loadConfig } from "@mrclrchtr/supi-lsp/api";

const LSP_DEFAULTS = {};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Discover servers that may shape the selected settings scope. */
function getConfiguredServers(
  scope: SettingsScope,
  cwd: string,
  homeDir?: string,
  projectTrusted = true,
): string[] {
  const names = new Set<string>();
  const includeProject = scope === "project" && projectTrusted;
  try {
    for (const name of Object.keys(
      loadConfig(cwd, { homeDir, projectTrusted: includeProject }).servers,
    )) {
      names.add(name);
    }
  } catch {
    // Raw scope reads below still expose names that need a settings action.
  }
  const scopes = includeProject ? (["global", "project"] as const) : (["global"] as const);
  for (const configScope of scopes) {
    const section = loadSupiConfigSectionForScope("lsp", cwd, {
      scope: configScope,
      homeDir,
    });
    const servers = section?.servers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) continue;
    for (const name of Object.keys(servers)) names.add(name);
  }
  return names.size > 0 ? [...names] : ["typescript"];
}

/** Load explicit per-server enabled values from one persisted scope. */
function getServerEnablement(
  scope: SettingsScope,
  cwd: string,
  homeDir?: string,
  projectTrusted = true,
): Map<string, boolean> {
  if (scope === "project" && !projectTrusted) return new Map();
  const section = loadSupiConfigSectionForScope("lsp", cwd, { scope, homeDir });
  const servers = section?.servers as Record<string, { enabled?: unknown }> | undefined;
  const enabled = new Map<string, boolean>();
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return enabled;
  for (const [name, server] of Object.entries(servers)) {
    if (
      server &&
      typeof server === "object" &&
      !Array.isArray(server) &&
      typeof server.enabled === "boolean"
    ) {
      enabled.set(name, server.enabled);
    }
  }
  return enabled;
}

interface DisabledServersSubmenuOptions {
  scope: SettingsScope;
  cwd: string;
  done: (selectedValue?: string) => void;
  homeDir?: string;
  projectTrusted: boolean;
}

function createDisabledServersSubmenu(options: DisabledServersSubmenuOptions): Component {
  const { scope, cwd, done, homeDir, projectTrusted } = options;
  const allServers = getConfiguredServers(scope, cwd, homeDir, projectTrusted);
  const scopedEnablement = getServerEnablement(scope, cwd, homeDir, projectTrusted);
  const inheritedEnablement =
    scope === "project"
      ? getServerEnablement("global", cwd, homeDir, projectTrusted)
      : new Map<string, boolean>();

  const items: SettingItem[] = allServers.map((name) => {
    const direct = scopedEnablement.get(name);
    const effective = direct ?? inheritedEnablement.get(name) ?? true;
    return {
      id: name,
      label:
        direct === undefined ? `${name} (inherit: ${effective ? "enabled" : "disabled"})` : name,
      currentValue: direct === undefined ? "inherit" : direct ? "enabled" : "disabled",
      values: ["inherit", "enabled", "disabled"],
    };
  });

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
        const values = Object.fromEntries(items.map((item) => [item.id, item.currentValue]));
        done(JSON.stringify(values));
        return;
      }
      settingsList.handleInput?.(data);
    },
  };
}

/** Persist complete per-language enablement choices through the settings module action path. */
type ServerEnablementChoice = "inherit" | "enabled" | "disabled";

function parseServerEnablement(value: string | undefined): Record<string, ServerEnablementChoice> {
  const selected: unknown = value ? JSON.parse(value) : {};
  if (
    !isRecord(selected) ||
    !Object.values(selected).every(
      (choice) => choice === "inherit" || choice === "enabled" || choice === "disabled",
    )
  ) {
    throw new Error("Invalid language-server enablement selection");
  }
  return selected as Record<string, ServerEnablementChoice>;
}

function applyServerEnablementChoice(
  servers: Record<string, unknown>,
  name: string,
  choice: ServerEnablementChoice,
): void {
  const rawServer = servers[name];
  const server = isRecord(rawServer) ? { ...rawServer } : undefined;
  if (choice === "inherit") {
    if (!server) return;
    delete server.enabled;
    if (Object.keys(server).length === 0) delete servers[name];
    else servers[name] = server;
    return;
  }
  servers[name] = { ...(server ?? {}), enabled: choice === "enabled" };
}

interface PersistServerEnablementOptions {
  scope: SettingsScope;
  cwd: string;
  value?: string;
  homeDir?: string;
  projectTrusted: boolean;
}

/** Persist complete per-language enablement choices through the settings module action path. */
function persistServerEnablement(options: PersistServerEnablementOptions): void {
  const { scope, cwd, value, homeDir, projectTrusted } = options;
  const choices = parseServerEnablement(value);
  const currentSection = loadSupiConfigSectionForScope("lsp", cwd, { scope, homeDir });
  const rawServers = currentSection?.servers;
  const servers: Record<string, unknown> = isRecord(rawServers) ? { ...rawServers } : {};
  const visibleNames = new Set(getConfiguredServers(scope, cwd, homeDir, projectTrusted));
  const names = new Set([
    ...Object.keys(choices),
    ...Object.keys(servers).filter((name) => visibleNames.has(name)),
  ]);
  for (const name of names) applyServerEnablementChoice(servers, name, choices[name] ?? "inherit");

  const nextSection = { ...(currentSection ?? {}) };
  if (Object.keys(servers).length > 0) nextSection.servers = servers;
  else delete nextSection.servers;
  replaceSupiConfigSection({ section: "lsp", scope, cwd }, nextSection, { homeDir });
}

/** Register per-language LSP enablement controls with the shared settings registry. */
export function registerLspSettings(pi: ExtensionAPI, homeDir?: string): void {
  registerSettings(
    pi,
    defineConfigSettings({
      id: "lsp",
      label: "LSP",
      section: "lsp",
      defaults: LSP_DEFAULTS,
      fields: [
        {
          kind: "custom" as const,
          key: "disabled_servers",
          label: "Disabled Servers",
          description: "Press Enter to choose which language servers to disable",
          resolve: (scope, cwd, ctx) => {
            const projectTrusted = ctx?.isProjectTrusted() ?? true;
            const scopedEnablement = getServerEnablement(scope, cwd, homeDir, projectTrusted);
            const globalEnablement = getServerEnablement("global", cwd, homeDir, projectTrusted);
            const names = new Set([
              ...getConfiguredServers(scope, cwd, homeDir, projectTrusted),
              ...scopedEnablement.keys(),
              ...globalEnablement.keys(),
            ]);
            const effectiveDisabled = [...names]
              .filter(
                (name) =>
                  (scopedEnablement.get(name) ?? globalEnablement.get(name) ?? true) === false,
              )
              .sort((a, b) => a.localeCompare(b));
            const label =
              effectiveDisabled.length > 0 ? effectiveDisabled.join(", ") : "none disabled";
            const source =
              scopedEnablement.size > 0
                ? scope
                : scope === "project" && globalEnablement.size > 0
                  ? "global"
                  : "default";
            const inheritanceSource =
              scope === "project" && scopedEnablement.size > 0
                ? globalEnablement.size > 0
                  ? "global"
                  : "default"
                : undefined;
            return { displayValue: label, source, inheritanceSource };
          },
          // biome-ignore lint/complexity/useMaxParams: custom settings callbacks receive the shared scope and ExtensionContext arguments.
          submenu: (_currentValue, done, scope, cwd, ctx) =>
            createDisabledServersSubmenu({
              scope,
              cwd,
              done,
              homeDir,
              projectTrusted: ctx?.isProjectTrusted() ?? true,
            }),
          // biome-ignore lint/complexity/useMaxParams: custom settings callbacks receive the shared scope and ExtensionContext arguments.
          persist: (scope, cwd, action, _helpers, ctx) =>
            persistServerEnablement({
              scope,
              cwd,
              value: action.kind === "set" ? action.value : undefined,
              homeDir,
              projectTrusted: ctx?.isProjectTrusted() ?? true,
            }),
        },
      ],
    }),
  );
}
