import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSupiConfig } from "../../../src/config/config.ts";
import { registerConfigSettings } from "../../../src/config/config-settings.ts";
import type { SettingsSection } from "../../../src/settings/settings-registry.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-core-config-settings-test-"));
}

const opts = (dir: string) => ({ homeDir: dir });

function makePi() {
  const eventHandlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    events: {
      on: vi.fn((channel: string, handler: (data: unknown) => void) => {
        const list = eventHandlers.get(channel) ?? [];
        list.push(handler);
        eventHandlers.set(channel, list);
        return () => list.splice(list.indexOf(handler), 1);
      }),
      emit: vi.fn((channel: string, data: unknown) => {
        for (const handler of eventHandlers.get(channel) ?? []) handler(data);
      }),
    },
    on: vi.fn(),
  };
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

function registerAndCollect(homeDir?: string): SettingsSection {
  const pi = makePi();
  let capturedSection: SettingsSection | undefined;

  // registerConfigSettings registers on the event bus, but also the callback
  // is stored so we can capture the section when the collector calls add.
  registerConfigSettings(pi as never, {
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

  // Extract the section by emitting the collect event
  pi.events.emit("supi:settings:collect", {
    add(section: SettingsSection) {
      capturedSection = section;
    },
  });
  return capturedSection!;
}

describe("registerConfigSettings persistence", () => {
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

  it("persistChange set writes to the selected scope's config", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const section = registerAndCollect();
    section.persistChange("project", tmpDir, "severity", "3");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);
  });

  it("persistChange set writes to global scope when selected", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const section = registerAndCollect(tmpDir);
    section.persistChange("global", tmpDir, "severity", "3");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);
  });

  it("persistChange unset removes the key from the selected scope's config", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ test: { severity: 3, tags: ["a", "b"] } }),
    );

    const section = registerAndCollect();
    section.persistChange("project", tmpDir, "tags", "");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(3);
    expect(config.tags).toEqual([]);
  });

  it("persistChange unset on global scope does not affect project scope", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

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

    const section = registerAndCollect(tmpDir);
    section.persistChange("global", tmpDir, "tags", "");

    const config = loadSupiConfig("test", tmpDir, TEST_DEFAULTS, opts(tmpDir));
    expect(config.severity).toBe(4);
    expect(config.tags).toEqual(["project"]);
  });
});
