import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerConfigSettings } from "../../../src/config/config-settings.ts";
import {
  clearRegisteredSettings,
  getRegisteredSettings,
} from "../../../src/settings/settings-registry.ts";

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

describe("declarative persistChange", () => {
  beforeEach(() => {
    clearRegisteredSettings();
  });

  afterEach(() => {
    clearRegisteredSettings();
  });

  const DECLARATIVE_DEFAULTS = {
    autoBool: true,
    autoNum: 5,
    autoList: [] as string[],
  };

  it("auto-generates persistChange for all-boolean items", () => {
    registerConfigSettings({
      id: "decl-bool",
      label: "Decl Bool",
      section: "decl-bool",
      defaults: { enabled: true },
      buildItems: () => [
        {
          id: "enabled",
          label: "Enabled",
          currentValue: "off",
          values: ["on", "off"],
          configType: "boolean" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    expect(section).toBeDefined();

    const tmpDir = makeTempDir();
    section.persistChange("project", tmpDir, "enabled", "on");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-bool", tmpDir, { enabled: true }, { homeDir: tmpDir });
    expect(config.enabled).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-generates persistChange for all-number items", () => {
    registerConfigSettings({
      id: "decl-num",
      label: "Decl Num",
      section: "decl-num",
      defaults: { timeout: 30 },
      buildItems: () => [
        {
          id: "timeout",
          label: "Timeout",
          currentValue: "30",
          values: ["10", "30", "60"],
          configType: "number" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    const tmpDir = makeTempDir();
    section.persistChange("project", tmpDir, "timeout", "60");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-num", tmpDir, { timeout: 30 }, { homeDir: tmpDir });
    expect(config.timeout).toBe(60);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-generates persistChange for stringList items", () => {
    registerConfigSettings({
      id: "decl-list",
      label: "Decl List",
      section: "decl-list",
      defaults: { names: [] as string[] },
      buildItems: () => [
        {
          id: "names",
          label: "Names",
          currentValue: "",
          configType: "stringList" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    const tmpDir = makeTempDir();
    section.persistChange("project", tmpDir, "names", "a, b, c");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-list", tmpDir, { names: [] }, { homeDir: tmpDir });
    expect(config.names).toEqual(["a", "b", "c"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("auto-generates persistChange for mixed types", () => {
    registerConfigSettings({
      id: "decl-mixed",
      label: "Decl Mixed",
      section: "decl-mixed",
      defaults: DECLARATIVE_DEFAULTS,
      buildItems: () => [
        {
          id: "autoBool",
          label: "Auto Bool",
          currentValue: "on",
          values: ["on", "off"],
          configType: "boolean" as const,
        },
        {
          id: "autoNum",
          label: "Auto Num",
          currentValue: "5",
          values: ["1", "5", "10"],
          configType: "number" as const,
        },
        {
          id: "autoList",
          label: "Auto List",
          currentValue: "",
          configType: "stringList" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    const tmpDir = makeTempDir();
    section.persistChange("project", tmpDir, "autoBool", "off");
    section.persistChange("project", tmpDir, "autoNum", "10");
    section.persistChange("project", tmpDir, "autoList", "x, y, z");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-mixed", tmpDir, DECLARATIVE_DEFAULTS, { homeDir: tmpDir });
    expect(config.autoBool).toBe(false);
    expect(config.autoNum).toBe(10);
    expect(config.autoList).toEqual(["x", "y", "z"]);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("number sets invalid value to unset key", () => {
    registerConfigSettings({
      id: "decl-num-invalid",
      label: "Decl Num",
      section: "decl-num-invalid",
      defaults: { timeout: 30 },
      buildItems: () => [
        {
          id: "timeout",
          label: "Timeout",
          currentValue: "30",
          values: ["10", "30", "60"],
          configType: "number" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    const tmpDir = makeTempDir();
    // Invalid number should fall back to unset (removing the override)
    section.persistChange("project", tmpDir, "timeout", "invalid");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-num-invalid", tmpDir, { timeout: 30 }, { homeDir: tmpDir });
    expect(config.timeout).toBe(30); // falls back to default

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("stringList with empty value unsets the key", () => {
    registerConfigSettings({
      id: "decl-list-empty",
      label: "Decl List",
      section: "decl-list-empty",
      defaults: { names: [] as string[] },
      buildItems: () => [
        {
          id: "names",
          label: "Names",
          currentValue: "",
          configType: "stringList" as const,
        },
      ],
    });

    const section = getRegisteredSettings()[0];
    const tmpDir = makeTempDir();
    // Empty string should unset the key
    section.persistChange("project", tmpDir, "names", "");

    const { loadSupiConfig } = require("../../../src/config/config.ts");
    const config = loadSupiConfig("decl-list-empty", tmpDir, { names: [] }, { homeDir: tmpDir });
    expect(config.names).toEqual([]); // falls back to default

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("manual persistChange is still accepted when all items have configType", () => {
    const manualFn = vi.fn();
    registerConfigSettings({
      id: "decl-manual",
      label: "Decl Manual",
      section: "decl-manual",
      defaults: { flag: true },
      buildItems: () => [
        {
          id: "flag",
          label: "Flag",
          currentValue: "on",
          values: ["on", "off"],
          configType: "boolean" as const,
        },
      ],
      persistChange: manualFn,
    });

    const section = getRegisteredSettings()[0];
    section.persistChange("project", "/tmp", "flag", "off");
    expect(manualFn).toHaveBeenCalledWith("project", "/tmp", "flag", "off", expect.anything());
  });
});
