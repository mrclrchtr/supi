import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { createPiMock } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const settingsMocks = vi.hoisted(() => ({
  define: vi.fn((options) => options),
  register: vi.fn(),
}));

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  defineConfigSettings: settingsMocks.define,
  registerSettings: settingsMocks.register,
}));

import {
  AGENT_CONFIG_SECTION,
  AGENT_DEFAULTS,
  loadAgentConfig,
  registerAgentSettings,
} from "../../src/config.ts";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "supi-agent-config-test-"));
}

describe("Agent Run config", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables the Agent Run tool by default", () => {
    const homeDir = makeTempDir();
    try {
      expect(loadAgentConfig(path.join(homeDir, "repo"), homeDir)).toEqual({
        agentToolEnabled: true,
      });
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("loads a project setting that disables the Agent Run tool", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    try {
      writeSupiConfig(
        { section: AGENT_CONFIG_SECTION, scope: "project", cwd },
        { agentToolEnabled: false },
        { homeDir },
      );

      expect(loadAgentConfig(cwd, homeDir).agentToolEnabled).toBe(false);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  it("registers the Agent Run availability setting", () => {
    registerAgentSettings({} as never);

    expect(settingsMocks.define).toHaveBeenCalledWith(
      expect.objectContaining({
        id: AGENT_CONFIG_SECTION,
        defaults: AGENT_DEFAULTS,
        fields: [expect.objectContaining({ kind: "boolean", key: "agentToolEnabled" })],
      }),
    );
    expect(settingsMocks.register).toHaveBeenCalledOnce();
  });

  it("applies Agent Run availability changes to the current session", () => {
    const homeDir = makeTempDir();
    const cwd = path.join(homeDir, "repo");
    fs.mkdirSync(cwd, { recursive: true });
    const pi = createPiMock();
    pi.setActiveTools(["read", "supi_agent_run"]);

    try {
      registerAgentSettings(pi as never, homeDir);
      const options = settingsMocks.define.mock.calls.at(-1)?.[0] as
        | { afterPersist?: (change: { cwd: string }) => void }
        | undefined;

      writeSupiConfig(
        { section: AGENT_CONFIG_SECTION, scope: "project", cwd },
        { agentToolEnabled: false },
        { homeDir },
      );
      options?.afterPersist?.({ cwd });
      expect(pi.getActiveTools()).toEqual(["read"]);

      writeSupiConfig(
        { section: AGENT_CONFIG_SECTION, scope: "project", cwd },
        { agentToolEnabled: true },
        { homeDir },
      );
      options?.afterPersist?.({ cwd });
      expect(pi.getActiveTools()).toEqual(["read", "supi_agent_run"]);
    } finally {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });
});
