// LSP settings registration for the umbrella package.

import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import { Container, Key, matchesKey, SettingsList, Text } from "@earendil-works/pi-tui";
import { registerConfigSettings } from "@mrclrchtr/supi-core/api";
import { LSP_DEFAULTS, type LspSettings, loadConfig } from "@mrclrchtr/supi-lsp/api";

/**
 * Register the LSP settings section under the umbrella code-intelligence
 * settings surface.
 */
export function registerLspConfigSettings(): void {
  registerConfigSettings({
    id: "lsp",
    label: "LSP",
    section: "lsp",
    defaults: LSP_DEFAULTS,
    buildItems: (settings: LspSettings, scope: "project" | "global", cwd: string) =>
      buildLspSettingItems(settings, scope, cwd),
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      handlePersistChange(settingId, value, helpers);
    },
  });
}

function handlePersistChange(
  settingId: string,
  value: string,
  helpers: { set: (key: string, value: unknown) => void; unset: (key: string) => void },
): void {
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
      if (value === "all") {
        // Selecting "all" means no server-specific allowlist — clear/unset
        helpers.unset("active");
      } else {
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
      break;
    }
    case "exclude": {
      const patterns = value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (patterns.length > 0) {
        helpers.set("exclude", patterns);
      } else {
        helpers.unset("exclude");
      }
      break;
    }
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

function buildLspSettingItems(
  settings: LspSettings,
  scope: "project" | "global",
  cwd: string,
): SettingItem[] {
  // Build active server submenu data from available config
  const config = loadConfig(cwd);
  const allServers = Object.keys(config.servers);
  const _allEnabled = settings.active.length === 0;

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
      description: "Configure which language servers are active",
      currentValue:
        settings.active.length > 0
          ? settings.active.join(", ")
          : allServers.length > 0
            ? "all"
            : "none configured",
      submenu: (_currentValue, done) => createServerSubmenu(scope, cwd, settings, done),
    },
    {
      id: "exclude",
      label: "Exclude Patterns",
      description:
        "Gitignore patterns to suppress LSP diagnostics. Edit .pi/supi/config.json → lsp.exclude.",
      currentValue: settings.exclude.length > 0 ? settings.exclude.join(", ") : "none",
      values: ["none"],
    },
  ];
}

/** Multi-select submenu for choosing which language servers are active. */
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
    (id: string, newValue: string) => {
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
