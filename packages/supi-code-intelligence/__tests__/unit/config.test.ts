import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsModule } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CODE_INTELLIGENCE_DEFAULTS,
  loadCodeIntelligenceConfig,
  registerCodeIntelligenceSettings,
  resolveOverviewEnabled,
} from "../../src/config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "code-intelligence-config-test-"));
}

function makePi() {
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on: vi.fn((channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(channel) ?? [];
        list.push(handler);
        eventHandlers.set(channel, list);
        return () => void 0;
      }),
      emit: vi.fn((channel: string, data: unknown) => {
        for (const handler of eventHandlers.get(channel) ?? []) handler(data);
      }),
    },
    on: vi.fn(),
  };
}

function collectModule(pi: ReturnType<typeof makePi>): SettingsModule {
  let captured: SettingsModule | undefined;
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add(module: SettingsModule) {
      captured = module;
    },
  });
  expect(captured).toBeDefined();
  return captured as SettingsModule;
}

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs.length = 0;
});

describe("CodeIntelligenceConfig", () => {
  it("uses default instruction file names and enabled overview", () => {
    expect(CODE_INTELLIGENCE_DEFAULTS).toEqual({
      instructionFileNames: ["CLAUDE.md", "AGENTS.md"],
      overviewEnabled: true,
    });
  });

  it("loads code-intelligence.instructionFileNames from project config", () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": { instructionFileNames: ["RULES.md"] } }),
    );

    expect(loadCodeIntelligenceConfig(tmpDir, tmpDir).instructionFileNames).toEqual(["RULES.md"]);
    expect(loadCodeIntelligenceConfig(tmpDir, tmpDir).overviewEnabled).toBe(true);
  });

  it("loads overviewEnabled false from project config", () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: false } }),
    );

    expect(loadCodeIntelligenceConfig(tmpDir, tmpDir).overviewEnabled).toBe(false);
  });

  it("lets the trusted project override the global overview setting", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);

    // Global scope disables the overview; the trusted project re-enables it.
    fs.mkdirSync(path.join(homeDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: false } }),
    );
    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: true } }),
    );

    expect(loadCodeIntelligenceConfig(tmpDir, homeDir).overviewEnabled).toBe(true);
  });

  it("applies a global overview override when the project has none", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    fs.mkdirSync(path.join(homeDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: false } }),
    );

    expect(loadCodeIntelligenceConfig(tmpDir, homeDir).overviewEnabled).toBe(false);
  });
});

describe("resolveOverviewEnabled", () => {
  function writeGlobal(homeDir: string, value: unknown): void {
    fs.mkdirSync(path.join(homeDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: value } }),
    );
  }

  function writeProject(cwd: string, value: unknown): void {
    fs.mkdirSync(path.join(cwd, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: value } }),
    );
  }

  it("defaults to enabled", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    expect(resolveOverviewEnabled(tmpDir, true, homeDir)).toBe(true);
    expect(resolveOverviewEnabled(tmpDir, false, homeDir)).toBe(true);
  });

  it("applies a trusted project override", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    writeProject(tmpDir, false);
    expect(resolveOverviewEnabled(tmpDir, true, homeDir)).toBe(false);
  });

  it("ignores an untrusted project override", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    writeProject(tmpDir, false);
    expect(resolveOverviewEnabled(tmpDir, false, homeDir)).toBe(true);
  });

  it("keeps the global value when an untrusted project overrides it", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    writeGlobal(homeDir, false);
    writeProject(tmpDir, true);
    expect(resolveOverviewEnabled(tmpDir, false, homeDir)).toBe(false);
  });

  it("applies the global value through a trusted project that has none", () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    writeGlobal(homeDir, false);
    expect(resolveOverviewEnabled(tmpDir, true, homeDir)).toBe(false);
  });

  it.each(["false", "true", 0, 1, {}, null])(
    "fails closed on a malformed project value %s",
    (malformed) => {
      const tmpDir = makeTempDir();
      const homeDir = makeTempDir();
      tempDirs.push(tmpDir, homeDir);
      writeProject(tmpDir, malformed);
      expect(resolveOverviewEnabled(tmpDir, true, homeDir)).toBe(false);
    },
  );
});

describe("registerCodeIntelligenceSettings", () => {
  it("registers a code-intelligence settings section", () => {
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never);

    const module = collectModule(pi);

    expect(module).toMatchObject({ id: "code-intelligence", label: "Code Intelligence" });
  });

  it("reads instructionFileNames and overviewEnabled with the default source", async () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never, homeDir);

    const module = collectModule(pi);
    const { rows: values } = await module.read({ scope: "project", cwd: tmpDir });

    expect(values).toHaveLength(2);
    expect(values[0]).toMatchObject({
      field: { kind: "stringList", key: "instructionFileNames" },
      source: "default",
    });
    expect(values[1]).toMatchObject({
      field: { kind: "boolean", key: "overviewEnabled" },
      source: "default",
    });
  });

  it("shows the global overview setting source for project scope", async () => {
    const tmpDir = makeTempDir();
    const homeDir = makeTempDir();
    tempDirs.push(tmpDir, homeDir);
    fs.mkdirSync(path.join(homeDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "code-intelligence": { overviewEnabled: false } }),
    );

    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never, homeDir);

    const module = collectModule(pi);
    const { rows: values } = await module.read({ scope: "project", cwd: tmpDir });

    expect(values[1]).toMatchObject({
      field: { kind: "boolean", key: "overviewEnabled" },
      source: "global",
    });
  });

  it("persists instructionFileNames through apply", async () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never, tmpDir);

    const module = collectModule(pi);
    await module.apply({
      scope: "project",
      cwd: tmpDir,
      fieldKey: "instructionFileNames",
      action: { kind: "set", value: "RULES.md, NOTES.md" },
    });

    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi/supi/config.json"), "utf-8"));
    expect(raw["code-intelligence"].instructionFileNames).toEqual(["RULES.md", "NOTES.md"]);
  });

  it("persists overviewEnabled through apply", async () => {
    const tmpDir = makeTempDir();
    tempDirs.push(tmpDir);
    const pi = makePi();
    registerCodeIntelligenceSettings(pi as never, tmpDir);

    const module = collectModule(pi);
    await module.apply({
      scope: "project",
      cwd: tmpDir,
      fieldKey: "overviewEnabled",
      action: { kind: "set", value: "off" },
    });

    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, ".pi/supi/config.json"), "utf-8"));
    expect(raw["code-intelligence"].overviewEnabled).toBe(false);

    await module.apply({
      scope: "project",
      cwd: tmpDir,
      fieldKey: "overviewEnabled",
      action: { kind: "unset" },
    });
    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    const cleared = fs.existsSync(configPath)
      ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
      : {};
    expect(cleared["code-intelligence"]?.overviewEnabled).toBeUndefined();
  });
});
