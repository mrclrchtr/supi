import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerReviewSettings: vi.fn(),
  syncReviewAgentTools: vi.fn(),
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
    expect(getTool(pi, "review_output")).toBeDefined();
    expect(mocks.syncReviewAgentTools).not.toHaveBeenCalled();
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(true);

    await pi.emit("session_start", { type: "session_start", reason: "startup" }, { cwd: "/repo" });
    expect(mocks.syncReviewAgentTools).toHaveBeenCalledWith(pi, "/repo");
  });
});
