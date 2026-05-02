import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerConfigSettings } from "../config-settings.ts";
import { clearRegisteredSettings, getRegisteredSettings } from "../settings-registry.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-core-config-settings-test-"));
}

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

describe("registerConfigSettings", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  it("registers a config-backed settings section", () => {
    registerTestSettings();
    const sections = getRegisteredSettings();

    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ id: "test", label: "Test" });
  });

  it("loadValues returns items built from scoped config", () => {
    registerTestSettings();
    const section = getRegisteredSettings()[0];
    const items = section.loadValues("project", "/tmp");

    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id)).toEqual(["enabled", "severity", "tags"]);
    expect(items.find((i) => i.id === "enabled")?.currentValue).toBe("on");
    expect(items.find((i) => i.id === "severity")?.currentValue).toBe("1");
    expect(items.find((i) => i.id === "tags")?.currentValue).toBe("none");
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ test: { enabled: false, severity: 2, tags: ["global"] } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ test: { enabled: true, severity: 4, tags: ["project"] } }),
    );

    registerTestSettings(tmpDir);
    const section = getRegisteredSettings()[0];

    const globalItems = section.loadValues("global", tmpDir);
    const projectItems = section.loadValues("project", tmpDir);

    expect(globalItems.find((i) => i.id === "enabled")?.currentValue).toBe("off");
    expect(globalItems.find((i) => i.id === "severity")?.currentValue).toBe("2");
    expect(globalItems.find((i) => i.id === "tags")?.currentValue).toBe("global");

    expect(projectItems.find((i) => i.id === "enabled")?.currentValue).toBe("on");
    expect(projectItems.find((i) => i.id === "severity")?.currentValue).toBe("4");
    expect(projectItems.find((i) => i.id === "tags")?.currentValue).toBe("project");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project scope falls back to defaults when only global config exists", () => {
    const tmpDir = makeTempDir();

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ test: { severity: 3 } }),
    );

    registerTestSettings();
    const section = getRegisteredSettings()[0];
    const projectItems = section.loadValues("project", tmpDir);

    expect(projectItems.find((i) => i.id === "enabled")?.currentValue).toBe("on");
    expect(projectItems.find((i) => i.id === "severity")?.currentValue).toBe("1");
    expect(projectItems.find((i) => i.id === "tags")?.currentValue).toBe("none");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
