import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SettingsSection } from "@mrclrchtr/supi-core/settings";
import { SUPI_SETTINGS_COLLECT_EVENT } from "@mrclrchtr/supi-core/settings";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerBashTimeoutSettings } from "../../src/settings-registration.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bash-timeout-settings-test-"));
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

function collect(pi: ReturnType<typeof makePi>): SettingsSection {
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

describe("registerBashTimeoutSettings", () => {
  it("registers a bash-timeout settings section", () => {
    const pi = makePi();
    registerBashTimeoutSettings(pi as never);
    const section = collect(pi);
    expect(section).toMatchObject({ id: "bash-timeout", label: "Bash Timeout" });
  });

  it("loadValues returns one setting item", () => {
    const pi = makePi();
    registerBashTimeoutSettings(pi as never);
    const section = collect(pi);
    const items = section.loadValues("project", "/tmp");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "defaultTimeout",
      label: "Default Timeout",
      currentValue: "120",
    });
  });

  it("loadValues reads the selected scope instead of merged effective config", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    fs.mkdirSync(path.join(tmpDir, ".pi/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 60 } }),
    );

    const pi = makePi();
    registerBashTimeoutSettings(pi as never, tmpDir);
    const section = collect(pi);

    const globalItems = section.loadValues("global", tmpDir);
    const projectItems = section.loadValues("project", tmpDir);

    expect(globalItems[0]?.currentValue).toBe("300");
    expect(projectItems[0]?.currentValue).toBe("60");
  });

  it("project scope falls back to defaults when only global config exists", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    const pi = makePi();
    registerBashTimeoutSettings(pi as never, tmpDir);
    const section = collect(pi);
    const projectItems = section.loadValues("project", tmpDir);

    expect(projectItems[0]?.currentValue).toBe("120");
  });

  it("persistChange writes positive numeric value", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerBashTimeoutSettings(pi as never, tmpDir);
    const section = collect(pi);
    section.persistChange("global", tmpDir, "defaultTimeout", "300");

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".pi/agent/supi/config.json"), "utf-8"),
    );
    expect(config["bash-timeout"].defaultTimeout).toBe(300);
  });

  it("persistChange unsets key for invalid value", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, ".pi/agent/supi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi/agent/supi/config.json"),
      JSON.stringify({ "bash-timeout": { defaultTimeout: 300 } }),
    );

    const pi = makePi();
    registerBashTimeoutSettings(pi as never, tmpDir);
    const section = collect(pi);
    section.persistChange("global", tmpDir, "defaultTimeout", "not-a-number");

    const configPath = path.join(tmpDir, ".pi/agent/supi/config.json");
    const fileExists = fs.existsSync(configPath);
    if (fileExists) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config["bash-timeout"]).toBeUndefined();
    }
  });
});
