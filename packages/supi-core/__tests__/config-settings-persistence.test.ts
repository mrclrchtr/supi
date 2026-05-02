import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadSupiConfig } from "../config.ts";
import { registerConfigSettings } from "../config-settings.ts";
import { clearRegisteredSettings, getRegisteredSettings } from "../settings-registry.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-core-config-settings-test-"));
}

const opts = (dir: string) => ({ homeDir: dir });

interface TestConfig {
  enabled: boolean;
  severity: number;
  tags: string[];
}

const TEST_DEFAULTS: TestConfig = {
  enabled: true,
  severity: 1,
  tags: [],
};

function registerTestSettings(homeDir?: string): void {
  registerConfigSettings({
    homeDir,
    id: "test",
    label: "Test",
    section: "test",
    defaults: TEST_DEFAULTS,
    buildItems: (settings) => [
      {
        id: "enabled",
        label: "Enabled",
        currentValue: settings.enabled ? "on" : "off",
        values: ["on", "off"],
      },
      {
        id: "severity",
        label: "Severity",
        currentValue: String(settings.severity),
        values: ["1", "2", "3", "4"],
      },
      {
        id: "tags",
        label: "Tags",
        currentValue: settings.tags.join(", ") || "none",
      },
    ],
    // biome-ignore lint/complexity/useMaxParams: ConfigSettingsOptions interface callback
    persistChange: (_scope, _cwd, settingId, value, helpers) => {
      switch (settingId) {
        case "enabled":
          helpers.set("enabled", value === "on");
          break;
        case "severity": {
          const num = Number.parseInt(value, 10);
          helpers.set("severity", Number.isNaN(num) ? 1 : num);
          break;
        }
        case "tags": {
          const tags = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
          if (tags.length > 0) {
            helpers.set("tags", tags);
          } else {
            helpers.unset("tags");
          }
          break;
        }
      }
    },
  });
}

describe("registerConfigSettings persistence", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("persistChange set writes to the selected scope's config", () => {
    const tmpDir = makeTempDir();

    registerTestSettings();
    const section = getRegisteredSettings()[0];
    section.persistChange("project", tmpDir, "severity", "3");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange set writes to global scope when selected", () => {
    const tmpDir = makeTempDir();

    registerTestSettings(tmpDir);
    const section = getRegisteredSettings()[0];
    section.persistChange("global", tmpDir, "severity", "3");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange unset removes the key from the selected scope's config", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ test: { severity: 3, tags: ["a", "b"] } }),
    );

    registerTestSettings();
    const section = getRegisteredSettings()[0];
    section.persistChange("project", tmpDir, "tags", "");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);
    expect(config.tags).toEqual([]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("persistChange unset on global scope does not affect project scope", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ test: { severity: 2, tags: ["global"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ test: { severity: 4, tags: ["project"] } }),
    );

    registerTestSettings(tmpDir);
    const section = getRegisteredSettings()[0];
    section.persistChange("global", tmpDir, "tags", "");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(4);
    expect(config.tags).toEqual(["project"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
