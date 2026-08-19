import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTools } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerAgentSettings: vi.fn(),
  syncAgentRunTool: vi.fn(),
}));

vi.mock("../../src/config.ts", () => ({
  registerAgentSettings: mocks.registerAgentSettings,
  syncAgentRunTool: mocks.syncAgentRunTool,
}));

import agentExtension from "../../src/extension.ts";
import { agentProfileCatalogueStore } from "../../src/session.ts";

describe("supi-agent extension", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns about unavailable profile sources at startup", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "supi-agent-warning-"));
    const profileDirectory = join(agentDir, "supi", "agents", "explore");
    await mkdir(profileDirectory, { recursive: true });
    await writeFile(join(profileDirectory, "profile.json"), "{", "utf8");
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    try {
      const pi = createPiMock();
      const notify = vi.fn();
      agentExtension(pi as unknown as ExtensionAPI);
      const sessionStart = getHandlerOrThrow(pi, "session_start");
      const sessionShutdown = getHandlerOrThrow(pi, "session_shutdown");
      await sessionStart({ type: "session_start", reason: "startup" }, {
        cwd: process.cwd(),
        isProjectTrusted: () => false,
        ui: { notify },
      } as never);

      expect(notify).toHaveBeenCalledWith(
        expect.stringContaining(`Agent profile 'explore' in ${profileDirectory} is unavailable`),
        "warning",
      );
      await sessionShutdown({ type: "session_shutdown", reason: "quit" }, {} as never);
    } finally {
      agentProfileCatalogueStore.clear();
      vi.unstubAllEnvs();
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it("registers the Agent Run tool before it syncs current availability", async () => {
    const pi = createPiMock();
    agentExtension(pi as unknown as ExtensionAPI);
    const sessionStart = getHandlerOrThrow(pi, "session_start");
    const sessionShutdown = getHandlerOrThrow(pi, "session_shutdown");

    await sessionStart({ type: "session_start", reason: "startup" }, {
      cwd: process.cwd(),
      isProjectTrusted: () => false,
      ui: { notify: vi.fn() },
    } as never);

    expect(getTools(pi).some((tool) => tool.name === "agent_run")).toBe(true);
    expect(mocks.syncAgentRunTool).toHaveBeenCalledWith(pi, process.cwd());
    await sessionShutdown({ type: "session_shutdown", reason: "quit" }, {} as never);
  });

  it("refreshes the immutable profile catalogue on session start and clears it on shutdown", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "supi-agent-extension-"));
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    try {
      const pi = createPiMock();
      agentExtension(pi as unknown as ExtensionAPI);
      const sessionStart = getHandlerOrThrow(pi, "session_start");
      const sessionShutdown = getHandlerOrThrow(pi, "session_shutdown");

      const notify = vi.fn();
      await sessionStart({ type: "session_start", reason: "startup" }, {
        cwd: process.cwd(),
        isProjectTrusted: () => false,
        ui: { notify },
      } as never);
      expect(agentProfileCatalogueStore.get()?.profiles.map((profile) => profile.id)).toEqual([
        "explore",
        "general",
      ]);
      expect(notify).not.toHaveBeenCalled();

      const sections: unknown[] = [];
      pi.events.emit("supi:settings:collect", {
        add(section: unknown) {
          sections.push(section);
        },
      });
      expect(sections).toHaveLength(2);

      await sessionShutdown({ type: "session_shutdown", reason: "quit" }, {
        cwd: process.cwd(),
      } as never);
      expect(agentProfileCatalogueStore.get()).toBeUndefined();
    } finally {
      agentProfileCatalogueStore.clear();
      vi.unstubAllEnvs();
      await rm(agentDir, { recursive: true, force: true });
    }
  });
});
