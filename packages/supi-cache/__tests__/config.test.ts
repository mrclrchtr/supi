import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { clearRegisteredSettings, getRegisteredSettings } from "@mrclrchtr/supi-core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CACHE_MONITOR_DEFAULTS, loadCacheMonitorConfig } from "../src/config.ts";
import { registerCacheMonitorSettings } from "../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cache-monitor-settings-test-"));
}

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
    const config = loadCacheMonitorConfig(tmpDir, tmpDir);
    expect(config).toEqual(CACHE_MONITOR_DEFAULTS);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("registerCacheMonitorSettings", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers a cache-monitor settings section", () => {
    registerCacheMonitorSettings();
    const sections = getRegisteredSettings();
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({
      id: "supi-cache",
      label: "Cache",
    });
  });

  it("loadValues returns three setting items with defaults", () => {
    registerCacheMonitorSettings();
    const section = getRegisteredSettings()[0];
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

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({
        "supi-cache": { enabled: false, regressionThreshold: 15 },
      }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({
        "supi-cache": { notifications: false, regressionThreshold: 40 },
      }),
    );

    registerCacheMonitorSettings(tmpDir);
    const section = getRegisteredSettings()[0];

    const globalItems = section.loadValues("global", tmpDir);
    expect(globalItems.find((i) => i.id === "enabled")?.currentValue).toBe("off");
    expect(globalItems.find((i) => i.id === "regressionThreshold")?.currentValue).toBe("15");

    const projectItems = section.loadValues("project", tmpDir);
    expect(projectItems.find((i) => i.id === "notifications")?.currentValue).toBe("off");
    expect(projectItems.find((i) => i.id === "regressionThreshold")?.currentValue).toBe("40");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes enabled setting", () => {
    const tmpDir = makeTempDir();
    registerCacheMonitorSettings(tmpDir);
    const section = getRegisteredSettings()[0];

    section.persistChange("project", tmpDir, "enabled", "off");

    const configPath = path.join(tmpDir, ".pi/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw["supi-cache"].enabled).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange writes regressionThreshold as number", () => {
    const tmpDir = makeTempDir();
    registerCacheMonitorSettings(tmpDir);
    const section = getRegisteredSettings()[0];

    section.persistChange("global", tmpDir, "regressionThreshold", "15");

    const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
    const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    expect(raw["supi-cache"].regressionThreshold).toBe(15);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
