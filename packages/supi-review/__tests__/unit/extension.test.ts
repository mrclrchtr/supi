import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReviewConfig: vi.fn(() => ({
    agentModel: "current",
    plannerModel: "current",
    auditEnabled: false,
    bootstrapCommand: "",
    postReviewPolicy: "ask",
  })),
  registerReviewSettings: vi.fn(),
}));

vi.mock("../../src/config.ts", () => ({
  loadReviewConfig: mocks.loadReviewConfig,
  registerReviewSettings: mocks.registerReviewSettings,
}));

import reviewExtension from "../../src/review.ts";

describe("supi-review extension", () => {
  it("registers preparation, run, resumable output, and review commands", () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTool(pi, "supi_review_prepare")).toBeDefined();
    expect(getTool(pi, "supi_review_run")).toBeDefined();
    expect(getTool(pi, "supi_review_output")).toBeDefined();
    expect(getTools(pi).some((tool) => tool.name === "supi_review_audit")).toBe(false);
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(true);
  });
});
