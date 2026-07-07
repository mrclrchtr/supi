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

  it("loadValues returns one field value with default source", () => {
    const pi = makePi();
    registerBashTimeoutSettings(pi as never);
    const section = collect(pi);
    const values = section.loadValues("project", "/tmp");

    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      field: { kind: "number", key: "defaultTimeout", label: "Default Timeout" },
      source: "default",
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

    const globalValues = section.loadValues("global", tmpDir);
    const projectValues = section.loadValues("project", tmpDir);

    expect(globalValues[0]?.source).toBe("global");
    expect(globalValues[0]?.displayValue).toContain("300");
    expect(projectValues[0]?.source).toBe("project");
    expect(projectValues[0]?.displayValue).toContain("60");
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
    const projectValues = section.loadValues("project", tmpDir);

    expect(projectValues[0]?.source).toBe("global");
    expect(projectValues[0]?.displayValue).toContain("300");
  });

  it("handleAction set writes numeric value", () => {
    const tmpDir = makeTempDir();
    testFiles.push(tmpDir);

    const pi = makePi();
    registerBashTimeoutSettings(pi as never, tmpDir);
    const section = collect(pi);
    section.handleAction("global", tmpDir, "defaultTimeout", { kind: "set", value: "300" });

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, ".pi/agent/supi/config.json"), "utf-8"),
    );
    expect(config["bash-timeout"].defaultTimeout).toBe(300);
  });
});
