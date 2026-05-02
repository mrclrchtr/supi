import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  loadSupiConfig,
} from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLspSettings, registerLspSettings } from "../settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lsp-settings-test-"));
}

const opts = (dir: string) => ({ homeDir: dir });

function withHomeDir<T>(homeDir: string, run: () => T): T {
  const prevHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    return run();
  } finally {
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
  }
}

describe("loadLspSettings", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns defaults when no config exists", () => {
    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({ enabled: true, severity: 1, servers: [] });
  });

  it("reads project config", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2 } }),
    );

    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({ enabled: false, severity: 2, servers: [] });
  });
});

describe("registerLspSettings: registration", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers an LSP settings section", () => {
    registerLspSettings();
    const sections = getRegisteredSettings();
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "lsp", label: "LSP" });
  });

  it("loadValues returns three setting items", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["enabled", "severity", "servers"]);
  });

  it("enabled item defaults to on", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    const enabledItem = items.find((i) => i.id === "enabled");
    expect(enabledItem?.currentValue).toBe("on");
    expect(enabledItem?.values).toEqual(["on", "off"]);
  });

  it("severity item has cycling values", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    const severityItem = items.find((i) => i.id === "severity");
    expect(severityItem?.currentValue).toBe("1 (errors)");
    expect(severityItem?.values).toEqual(["1 (errors)", "2 (warnings)", "3 (info)", "4 (hints)"]);
  });

  it("servers item defaults to all", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    const serversItem = items.find((i) => i.id === "servers");
    expect(serversItem?.currentValue).toBe("all");
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2, servers: ["gopls"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { enabled: true, severity: 4, servers: ["pyright"] } }),
    );

    withHomeDir(tmpDir, () => {
      registerLspSettings();
      const section = getRegisteredSettings()[0];
      const globalItems = section.loadValues("global", tmpDir);
      const projectItems = section.loadValues("project", tmpDir);

      expect(globalItems.find((i) => i.id === "enabled")?.currentValue).toBe("off");
      expect(globalItems.find((i) => i.id === "severity")?.currentValue).toBe("2 (warnings)");
      expect(globalItems.find((i) => i.id === "servers")?.currentValue).toBe("gopls");

      expect(projectItems.find((i) => i.id === "enabled")?.currentValue).toBe("on");
      expect(projectItems.find((i) => i.id === "severity")?.currentValue).toBe("4 (hints)");
      expect(projectItems.find((i) => i.id === "servers")?.currentValue).toBe("pyright");
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("registerLspSettings: persistence", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("persistChange writes enabled to config", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "enabled", "off");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, servers: [] },
      opts(tmpDir),
    );
    expect(config.enabled).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes severity to config", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "severity", "3 (info)");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, servers: [] },
      opts(tmpDir),
    );
    expect(config.severity).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes servers to config", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "servers", "rust-analyzer, pyright");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, servers: [] },
      opts(tmpDir),
    );
    expect(config.servers).toEqual(["rust-analyzer", "pyright"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange removes servers when value is empty", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "servers", "rust-analyzer");
    section.persistChange("project", tmpDir, "servers", "");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, servers: [] },
      opts(tmpDir),
    );
    expect(config.servers).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes to global scope when selected", () => {
    const tmpDir = makeTempDir();

    withHomeDir(tmpDir, () => {
      registerLspSettings();
      const section = getRegisteredSettings()[0];

      section.persistChange("global", tmpDir, "enabled", "off");

      const config = loadSupiConfig(
        "lsp",
        tmpDir,
        { enabled: true, severity: 1, servers: [] },
        opts(tmpDir),
      );
      expect(config.enabled).toBe(false);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange unsets a key in the selected scope without affecting the other scope", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2, servers: ["gopls"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { enabled: true, severity: 4, servers: ["pyright"] } }),
    );

    withHomeDir(tmpDir, () => {
      registerLspSettings();
      const section = getRegisteredSettings()[0];
      section.persistChange("global", tmpDir, "servers", "");

      const config = loadSupiConfig(
        "lsp",
        tmpDir,
        { enabled: true, severity: 1, servers: [] },
        opts(tmpDir),
      );
      expect(config.enabled).toBe(true);
      expect(config.severity).toBe(4);
      expect(config.servers).toEqual(["pyright"]);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
