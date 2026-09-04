import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsModule } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_FORENSICS_DEFAULTS, loadCacheForensicsConfig } from "../../src/config.ts";
import { registerCacheForensicsSettings } from "../../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cache-forensics-settings-test-"));
}

const testFiles: string[] = [];

afterEach(() => {
  for (const directory of testFiles) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  testFiles.length = 0;
});

describe("CacheForensicsConfig", () => {
  it("has stable query defaults", () => {
    expect(CACHE_FORENSICS_DEFAULTS).toEqual({
      regressionThreshold: 25,
      idleThresholdMinutes: 5,
    });
  });

  it("returns defaults when no config exists", () => {
    const root = makeTempDir();
    testFiles.push(root);

    expect(loadCacheForensicsConfig(path.join(root, "project"), root)).toEqual(
      CACHE_FORENSICS_DEFAULTS,
    );
  });

  it("reads current cache thresholds over legacy values", () => {
    const root = makeTempDir();
    testFiles.push(root);
    const cwd = path.join(root, "project");

    fs.mkdirSync(path.join(root, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".pi/agent/supi/config.json"),
      JSON.stringify({ "cache-monitor": { regressionThreshold: 10, idleThresholdMinutes: 2 } }),
    );
    fs.mkdirSync(path.join(cwd, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi/supi/config.json"),
      JSON.stringify({ cache: { regressionThreshold: 40 } }),
    );

    expect(loadCacheForensicsConfig(cwd, root)).toEqual({
      regressionThreshold: 40,
      idleThresholdMinutes: 2,
    });
  });

  it("registers only the two forensics thresholds", async () => {
    const pi = createPiMock();
    registerCacheForensicsSettings(pi as never);
    let module: SettingsModule | undefined;
    pi.events.emit(SUPI_SETTINGS_COLLECT_EVENT, {
      add(candidate: SettingsModule) {
        module = candidate;
      },
    });

    expect(module?.label).toBe("Cache Forensics");
    const snapshot = await module?.read({ scope: "project", cwd: "/tmp" });
    expect(snapshot?.rows.map((row) => row.field.key)).toEqual([
      "regressionThreshold",
      "idleThresholdMinutes",
    ]);
  });

  it("ignores old live-monitor settings", () => {
    const root = makeTempDir();
    testFiles.push(root);
    const cwd = path.join(root, "project");

    fs.mkdirSync(path.join(cwd, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, ".pi/supi/config.json"),
      JSON.stringify({ cache: { enabled: false, notifications: false } }),
    );

    expect(loadCacheForensicsConfig(cwd, root)).toEqual(CACHE_FORENSICS_DEFAULTS);
  });
});
