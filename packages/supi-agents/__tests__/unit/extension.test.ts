import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";
import agentsExtension from "../../src/extension.ts";
import { agentProfileCatalogueStore } from "../../src/session.ts";

describe("supi-agents extension", () => {
  it("refreshes the immutable profile catalogue on session start and clears it on shutdown", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "supi-agents-extension-"));
    vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
    try {
      const pi = createPiMock();
      agentsExtension(pi as unknown as ExtensionAPI);
      const sessionStart = getHandlerOrThrow(pi, "session_start");
      const sessionShutdown = getHandlerOrThrow(pi, "session_shutdown");

      await sessionStart({ type: "session_start", reason: "startup" }, {
        cwd: process.cwd(),
        isProjectTrusted: () => false,
      } as never);
      expect(agentProfileCatalogueStore.get()?.profiles.map((profile) => profile.id)).toEqual([
        "explore",
        "general",
      ]);

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
