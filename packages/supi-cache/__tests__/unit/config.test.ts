import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsSection } from "@mrclrchtr/supi-core/settings";
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

function collectSection(pi: ReturnType<typeof makePi>): SettingsSection {
  let captured: SettingsSection | undefined;
  pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
    add(s: SettingsSection) {
      captured = s;
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
    const section = collectSection(pi);
    expect(section).toMatchObject({ id: "cache", label: "Cache" });
  });

  it("loadValues returns four setting items with defaults", () => {
    const pi = makePi();
    registerCacheMonitorSettings(pi as never);
    const section = collectSection(pi);
    const items = section.loadValues("project", "/tmp");

    expect(items.map((i) => i.id)).toEqual([
      "enabled",
      "notifications",
      "regressionThreshold",
      "idleThresholdMinutes",
    ]);
    expect(items.find((i) => i.id === "enabled")?.currentValue).toBe("on");
    expect(items.find((i) => i.id === "notifications")?.currentValue).toBe("on");
    expect(items.find((i) => i.id === "regressionThreshold")?.currentValue).toBe("25");
    expect(items.find((i) => i.id === "idleThresholdMinutes")?.currentValue).toBe("5");
  });

  it("reads selected scope config correctly", () => {
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
    const section = collectSection(pi);

    const globalItems = section.loadValues("global", tmpDir);
    expect(globalItems.find((i) => i.id === "enabled")?.currentValue).toBe("off");
    expect(globalItems.find((i) => i.id === "regressionThreshold")?.currentValue).toBe("15");

    const projectItems = section.loadValues("project", tmpDir);
    expect(projectItems.find((i) => i.id === "notifications")?.currentValue).toBe("off");
    expect(projectItems.find((i) => i.id === "regressionThreshold")?.currentValue).toBe("40");
  });

  it("persistChange writes enabled setting", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerCacheMonitorSettings(pi as never, tmpDir);
    const section = collectSection(pi);

    section.persistChange("project", tmpDir, "enabled", "off");

    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw.cache.enabled).toBe(false);
  });

  it("persistChange writes regressionThreshold as number", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerCacheMonitorSettings(pi as never, tmpDir);
    const section = collectSection(pi);

    section.persistChange("global", tmpDir, "regressionThreshold", "15");

    const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw.cache.regressionThreshold).toBe(15);
  });
});
