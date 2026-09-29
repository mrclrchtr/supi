/** Tests for the always-on LSP settings UI. */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsModule } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerLspSettings } from "../../../../src/substrate/lsp/settings.ts";

const settingsSpies = vi.hoisted(() => ({
  define: vi.fn((options) => options),
  register: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/settings", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core/settings")>();
  settingsSpies.define.mockImplementation(actual.defineConfigSettings);
  return {
    ...actual,
    defineConfigSettings: settingsSpies.define,
    registerSettings: settingsSpies.register,
  };
});

vi.mock("@mrclrchtr/supi-core/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-core/config")>();
  return {
    ...actual,
    loadSupiConfigSectionForScope: vi.fn(actual.loadSupiConfigSectionForScope),
    replaceSupiConfigSection: vi.fn(actual.replaceSupiConfigSection),
  };
});

vi.mock("@mrclrchtr/supi-lsp/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@mrclrchtr/supi-lsp/api")>();
  return {
    ...actual,
    loadConfig: vi.fn(actual.loadConfig),
  };
});

const tempDirs: string[] = [];

function makeTempDir(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lsp-settings-test-"));
  tempDirs.push(directory);
  return directory;
}

function writeConfig(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function projectConfigPath(cwd: string): string {
  return path.join(cwd, ".pi/supi/config.json");
}

function globalConfigPath(homeDir: string): string {
  return path.join(homeDir, ".pi/agent/supi/config.json");
}

function makeTrustedContext(trusted = true) {
  return { isProjectTrusted: () => trusted };
}

afterEach(() => {
  vi.clearAllMocks();
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function registeredModule(): SettingsModule {
  const module = settingsSpies.register.mock.calls[0]?.[1] as SettingsModule | undefined;
  if (!module) throw new Error("LSP settings module was not registered");
  return module;
}

describe("LSP settings UI", () => {
  it("registers language-server controls without a second exclusion list", {
    timeout: 30_000,
  }, () => {
    registerLspSettings({ on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } } as never);

    expect(settingsSpies.define).toHaveBeenCalledTimes(1);
    expect(settingsSpies.register).toHaveBeenCalledTimes(1);
    const callArgs = settingsSpies.define.mock.calls[0]?.[0] as {
      fields?: Array<{ key: string; kind: string; description?: string; submenu?: unknown }>;
    };
    const fields = callArgs?.fields;
    if (!fields) {
      throw new Error("fields is required");
    }

    const keys = fields.map((f) => f.key);

    expect(keys).toContain("disabled_servers");
    expect(keys).not.toContain("exclude");

    const disabledServers = fields.find((f) => f.key === "disabled_servers");
    expect(disabledServers?.kind).toBe("custom");
    expect(disabledServers?.submenu).toBeDefined();
  });

  it("reads inherited enablement and lets project true override global false", async () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    writeConfig(globalConfigPath(homeDir), {
      lsp: { servers: { python: { enabled: false } } },
    });

    const pi = { on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } };
    registerLspSettings(pi as never, homeDir);
    const module = registeredModule();
    const context = makeTrustedContext();

    const inherited = await module.read({ scope: "project", cwd, ctx: context as never });
    expect(inherited.rows[0]).toMatchObject({
      source: "global",
      displayValue: "python (global)",
    });

    await module.apply({
      scope: "project",
      cwd,
      ctx: context as never,
      fieldKey: "disabled_servers",
      action: { kind: "set", value: JSON.stringify({ python: "enabled" }) },
    });

    const project = JSON.parse(fs.readFileSync(projectConfigPath(cwd), "utf8"));
    expect(project.lsp.servers.python.enabled).toBe(true);
    expect(
      JSON.parse(fs.readFileSync(globalConfigPath(homeDir), "utf8")).lsp.servers.python.enabled,
    ).toBe(false);
    await expect(
      module.read({ scope: "project", cwd, ctx: context as never }),
    ).resolves.toMatchObject({
      rows: [
        expect.objectContaining({ source: "project", displayValue: "none disabled (project)" }),
      ],
    });
  });

  it("inherits by deleting only enabled and removes empty server entries", async () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    writeConfig(projectConfigPath(cwd), {
      lsp: {
        servers: {
          python: {
            command: "pylsp",
            settings: { python: { analysis: { strict: true } } },
            enabled: false,
          },
          rust: { enabled: false },
        },
      },
    });

    const pi = { on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } };
    registerLspSettings(pi as never, homeDir);
    const module = registeredModule();
    await module.apply({
      scope: "project",
      cwd,
      ctx: makeTrustedContext() as never,
      fieldKey: "disabled_servers",
      action: {
        kind: "set",
        value: JSON.stringify({ python: "inherit", rust: "inherit" }),
      },
    });

    const project = JSON.parse(fs.readFileSync(projectConfigPath(cwd), "utf8"));
    expect(project.lsp.servers.python).toEqual({
      command: "pylsp",
      settings: { python: { analysis: { strict: true } } },
    });
    expect(project.lsp.servers.rust).toBeUndefined();
  });

  it("writes global and project enablement to their own config paths", async () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    const pi = { on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } };
    registerLspSettings(pi as never, homeDir);
    const module = registeredModule();

    await module.apply({
      scope: "global",
      cwd,
      fieldKey: "disabled_servers",
      action: { kind: "set", value: JSON.stringify({ ruby: "disabled" }) },
    });
    await module.apply({
      scope: "project",
      cwd,
      fieldKey: "disabled_servers",
      action: { kind: "set", value: JSON.stringify({ ruby: "enabled" }) },
    });

    expect(JSON.parse(fs.readFileSync(globalConfigPath(homeDir), "utf8"))).toMatchObject({
      lsp: { servers: { ruby: { enabled: false } } },
    });
    expect(JSON.parse(fs.readFileSync(projectConfigPath(cwd), "utf8"))).toMatchObject({
      lsp: { servers: { ruby: { enabled: true } } },
    });
  });

  it("does not use untrusted project server values for the effective control", async () => {
    const cwd = makeTempDir();
    const homeDir = makeTempDir();
    writeConfig(globalConfigPath(homeDir), {
      lsp: { servers: { python: { enabled: false } } },
    });
    writeConfig(projectConfigPath(cwd), {
      lsp: {
        servers: {
          python: { enabled: true },
          custom: { command: "custom-lsp", fileTypes: ["custom"] },
        },
      },
    });

    const pi = { on: vi.fn(), events: { on: vi.fn(), emit: vi.fn() } };
    registerLspSettings(pi as never, homeDir);
    const module = registeredModule();
    const context = makeTrustedContext(false);

    const snapshot = await module.read({ scope: "project", cwd, ctx: context as never });
    expect(snapshot.rows[0]).toMatchObject({
      source: "global",
      displayValue: "python (global)",
    });

    await module.apply({
      scope: "project",
      cwd,
      ctx: context as never,
      fieldKey: "disabled_servers",
      action: { kind: "set", value: JSON.stringify({ python: "enabled" }) },
    });
    expect(
      JSON.parse(fs.readFileSync(projectConfigPath(cwd), "utf8")).lsp.servers.python.enabled,
    ).toBe(true);
    await expect(
      module.read({ scope: "project", cwd, ctx: context as never }),
    ).resolves.toMatchObject({
      rows: [expect.objectContaining({ source: "global", displayValue: "python (global)" })],
    });
  });
});
