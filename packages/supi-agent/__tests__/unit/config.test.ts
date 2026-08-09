import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeSupiConfig } from "@mrclrchtr/supi-core/config";
import { describe, expect, it, vi } from "vitest";

const mockRegisterDeclarativeSettings = vi.hoisted(() => vi.fn());

vi.mock("@mrclrchtr/supi-core/settings", () => ({
  registerDeclarativeSettings: mockRegisterDeclarativeSettings,
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

    expect(mockRegisterDeclarativeSettings).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: AGENT_CONFIG_SECTION,
        defaults: AGENT_DEFAULTS,
        fields: [expect.objectContaining({ kind: "boolean", key: "agentToolEnabled" })],
      }),
    );
  });
});
