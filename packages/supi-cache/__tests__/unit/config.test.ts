import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsModule } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_MONITOR_DEFAULTS, loadCacheMonitorConfig } from "../../src/config.ts";
import { registerCacheMonitorSettings } from "../../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cache-monitor-settings-test-"));
}

function makePi() {
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on: vi.fn((_channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(SUPI_SETTINGS_COLLECT_EVENT) ?? [];
        list.push(handler);
        eventHandlers.set(SUPI_SETTINGS_COLLECT_EVENT, list);
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
  return captured!;
}

const testFiles: string[] = [];

afterEach(() => {
  for (const d of testFiles) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* ok */
    }
  }
  testFiles.length = 0;
});

describe("CacheMonitorConfig defaults", () => {
  it("has expected defaults", () => {
    expect(CACHE_MONITOR_DEFAULTS).toEqual({
      enabled: true,
      notifications: true,
      regressionThreshold: 25,
      idleThresholdMinutes: 5,
    });
  });

  it("loadCacheMonitorConfig returns defaults when no config exists", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);
    const config = loadCacheMonitorConfig(tmpDir, tmpDir);
    expect(config).toEqual(CACHE_MONITOR_DEFAULTS);
  });
});

describe("registerCacheMonitorSettings", () => {
  it("registers a cache-monitor settings section", () => {
    const pi = makePi();
    registerCacheMonitorSettings(pi as never);
    const module = collectModule(pi);
    expect(module).toMatchObject({ id: "cache", label: "Cache" });
  });

  it("read returns four field values with default source", async () => {
    const pi = makePi();
    registerCacheMonitorSettings(pi as never);
    const module = collectModule(pi);
    const { rows: values } = await module.read({ scope: "project", cwd: "/tmp" });

    expect(values.map((v) => v.field.key)).toEqual([
      "enabled",
      "notifications",
      "regressionThreshold",
      "idleThresholdMinutes",
    ]);
    expect(values.find((v) => v.field.key === "enabled")?.displayValue).toContain("on");
    expect(values.find((v) => v.field.key === "notifications")?.displayValue).toContain("on");
    expect(values.find((v) => v.field.key === "regressionThreshold")?.displayValue).toContain("25");
    expect(values.find((v) => v.field.key === "idleThresholdMinutes")?.displayValue).toContain("5");
  });

  it("reads selected scope config with correct source", async () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ cache: { enabled: false, regressionThreshold: 15 } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ cache: { notifications: false, regressionThreshold: 40 } }),
    );

    const pi = makePi();
    registerCacheMonitorSettings(pi as never, tmpDir);
    const module = collectModule(pi);

    const { rows: globalValues } = await module.read({ scope: "global", cwd: tmpDir });
    expect(globalValues.find((v) => v.field.key === "enabled")?.source).toBe("global");
    expect(globalValues.find((v) => v.field.key === "enabled")?.displayValue).toContain("off");

    const { rows: projectValues } = await module.read({ scope: "project", cwd: tmpDir });
    expect(projectValues.find((v) => v.field.key === "notifications")?.source).toBe("project");
    expect(projectValues.find((v) => v.field.key === "notifications")?.displayValue).toContain(
      "off",
    );
  });

  it("handleAction writes enabled setting", async () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerCacheMonitorSettings(pi as never, tmpDir);
    const module = collectModule(pi);

    await module.apply({
      scope: "project",
      cwd: tmpDir,
      fieldKey: "enabled",
      action: { kind: "set", value: "off" },
    });

    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw.cache.enabled).toBe(false);
  });

  it("handleAction writes regressionThreshold as number", async () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerCacheMonitorSettings(pi as never, tmpDir);
    const module = collectModule(pi);

    await module.apply({
      scope: "global",
      cwd: tmpDir,
      fieldKey: "regressionThreshold",
      action: { kind: "set", value: "15" },
    });

    const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw.cache.regressionThreshold).toBe(15);
  });
});
