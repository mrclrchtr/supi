import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
  loadSupiConfig,
} from "@mrclrchtr/supi-core/api";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getLspDisabledMessage,
  loadLspSettings,
  registerLspSettings,
} from "../src/settings-registration.ts";

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
    expect(result).toEqual({ enabled: true, severity: 1, active: [], exclude: [] });
  });

  it("reads project config", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2 } }),
    );

    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({ enabled: false, severity: 2, active: [], exclude: [] });
  });

  it("reads exclude patterns from config", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ lsp: { exclude: ["__tests__/", "*.generated.ts"] } }),
    );

    const result = loadLspSettings(tmpDir, tmpDir);
    expect(result).toEqual({
      enabled: true,
      severity: 1,
      active: [],
      exclude: ["__tests__/", "*.generated.ts"],
    });
  });
});

describe("getLspDisabledMessage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns generic message when no config exists", () => {
    const result = getLspDisabledMessage(tmpDir, tmpDir);
    expect(result).toBe("LSP is disabled in settings");
  });

  it("returns project message when project config disabled LSP", () => {
    const projectDir = path.join(tmpDir, ".pi/supi");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, "config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    const result = getLspDisabledMessage(tmpDir, tmpDir);
    expect(result).toBe("LSP is disabled in project settings (.pi/supi/config.json)");
  });

  it("returns global message when global config disabled LSP", () => {
    const globalDir = path.join(tmpDir, ".pi/agent/supi");
    fs.mkdirSync(globalDir, { recursive: true });
    fs.writeFileSync(
      path.join(globalDir, "config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    const result = getLspDisabledMessage(tmpDir, tmpDir);
    expect(result).toBe("LSP is disabled in global settings (~/.pi/agent/supi/config.json)");
  });

  it("prefers project message when both scopes disabled LSP", () => {
    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { enabled: false } }),
    );

    const result = getLspDisabledMessage(tmpDir, tmpDir);
    expect(result).toBe("LSP is disabled in project settings (.pi/supi/config.json)");
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

  it("loadValues returns four setting items", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.id)).toEqual(["enabled", "severity", "active", "exclude"]);
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

  it("active item defaults to all", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    const activeItem = items.find((i) => i.id === "active");
    expect(activeItem?.currentValue).toBe("all");
  });

  it("exclude item defaults to none", () => {
    registerLspSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");
    const excludeItem = items.find((i) => i.id === "exclude");
    expect(excludeItem?.currentValue).toBe("none");
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();
    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ lsp: { enabled: false, severity: 2, active: ["go"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { enabled: true, severity: 4, active: ["python"] } }),
    );

    withHomeDir(tmpDir, () => {
      registerLspSettings();
      const section = getRegisteredSettings()[0];
      const globalItems = section.loadValues("global", tmpDir);
      const projectItems = section.loadValues("project", tmpDir);

      expect(globalItems.find((i) => i.id === "enabled")?.currentValue).toBe("off");
      expect(globalItems.find((i) => i.id === "severity")?.currentValue).toBe("2 (warnings)");
      expect(globalItems.find((i) => i.id === "active")?.currentValue).toBe("go");

      expect(projectItems.find((i) => i.id === "enabled")?.currentValue).toBe("on");
      expect(projectItems.find((i) => i.id === "severity")?.currentValue).toBe("4 (hints)");
      expect(projectItems.find((i) => i.id === "active")?.currentValue).toBe("python");
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
      { enabled: true, severity: 1, active: [] },
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
      { enabled: true, severity: 1, active: [] },
      opts(tmpDir),
    );
    expect(config.severity).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes servers to config", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "active", "rust, python");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, active: [] },
      opts(tmpDir),
    );
    expect(config.active).toEqual(["rust", "python"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange removes servers when value is empty", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "active", "rust");
    section.persistChange("project", tmpDir, "active", "");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, active: [] },
      opts(tmpDir),
    );
    expect(config.active).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes exclude patterns to config", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "exclude", "__tests__/, *.generated.ts");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, active: [], exclude: [] as string[] },
      opts(tmpDir),
    );
    expect(config.exclude).toEqual(["__tests__/", "*.generated.ts"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange removes exclude patterns when value is empty", () => {
    const tmpDir = makeTempDir();
    registerLspSettings();
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "exclude", "__tests__/");
    section.persistChange("project", tmpDir, "exclude", "");

    const config = loadSupiConfig(
      "lsp",
      tmpDir,
      { enabled: true, severity: 1, active: [], exclude: [] as string[] },
      opts(tmpDir),
    );
    expect(config.exclude).toEqual([]);

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
        { enabled: true, severity: 1, active: [] },
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
      JSON.stringify({ lsp: { enabled: false, severity: 2, active: ["go"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ lsp: { enabled: true, severity: 4, active: ["python"] } }),
    );

    withHomeDir(tmpDir, () => {
      registerLspSettings();
      const section = getRegisteredSettings()[0];
      section.persistChange("global", tmpDir, "active", "");

      const config = loadSupiConfig(
        "lsp",
        tmpDir,
        { enabled: true, severity: 1, active: [] },
        opts(tmpDir),
      );
      expect(config.enabled).toBe(true);
      expect(config.severity).toBe(4);
      expect(config.active).toEqual(["python"]);
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
