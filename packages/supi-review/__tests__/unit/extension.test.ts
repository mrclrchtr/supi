import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import agentExtension from "@mrclrchtr/supi-agent/extension";
import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerReviewSettings: vi.fn(),
  syncReviewAgentTools: vi.fn(() => ({ agentToolEnabled: true })),
}));

vi.mock("../../src/config.ts", () => ({
  registerReviewSettings: mocks.registerReviewSettings,
  syncReviewAgentTools: mocks.syncReviewAgentTools,
}));

import reviewExtension from "../../src/review.ts";

describe("supi-review extension", () => {
  it("waits for session start before it syncs Review tool availability", async () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTools(pi).map((tool) => tool.name)).toEqual([
      "review_output",
      "review_run",
      "review_audit",
    ]);
    expect(getTools(pi).some((tool) => tool.name === "review_prepare")).toBe(false);
    expect(getTool(pi, "review_run")).toMatchObject({ exposure: "model-only" });
    for (const name of ["review_output", "review_audit"]) {
      expect({ exposure: "direct", ...getTool(pi, name) }).toMatchObject({ exposure: "direct" });
    }
    expect(mocks.syncReviewAgentTools).not.toHaveBeenCalled();
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-agent-cleanup")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(false);

    await pi.emit("session_start", { type: "session_start", reason: "startup" }, { cwd: "/repo" });
    expect(mocks.syncReviewAgentTools).toHaveBeenCalledWith(pi, "/repo");
  });

  it("shares one /supi-agent-cleanup command with the Agent extension", async () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);
    agentExtension(pi as unknown as ExtensionAPI);

    const cleanupRegistrations = vi
      .mocked(pi.registerCommand)
      .mock.calls.filter(([name]) => name === "supi-agent-cleanup");
    expect(cleanupRegistrations).toHaveLength(1);
    await pi.emit("session_shutdown", { type: "session_shutdown", reason: "quit" }, {});
  });
});
