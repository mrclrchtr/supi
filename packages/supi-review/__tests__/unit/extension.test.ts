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
  it("registers Review tools before it syncs current availability", () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTools(pi).map((tool) => tool.name)).toEqual([
      "supi_review_output",
      "supi_review_run",
      "supi_review_audit",
    ]);
    expect(getTools(pi).some((tool) => tool.name === "supi_review_prepare")).toBe(false);
    expect(getTool(pi, "supi_review_output")).toBeDefined();
    expect(mocks.syncReviewAgentTools).toHaveBeenCalledWith(pi, process.cwd());
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(true);
  });
});
