import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool, getTools } from "@mrclrchtr/supi-test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadReviewConfig: vi.fn(() => ({
    agentToolEnabled: true,
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadReviewConfig.mockReturnValue({
      agentToolEnabled: true,
      agentModel: "current",
      plannerModel: "current",
      auditEnabled: false,
      bootstrapCommand: "",
      postReviewPolicy: "ask",
    });
  });

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

  it("registers only review output when agent tools are disabled", () => {
    mocks.loadReviewConfig.mockReturnValue({
      agentToolEnabled: false,
      agentModel: "current",
      plannerModel: "current",
      auditEnabled: false,
      bootstrapCommand: "",
      postReviewPolicy: "ask",
    });
    const pi = createPiMock();

    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTools(pi).map((tool) => tool.name)).toEqual(["supi_review_output"]);
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(true);
  });
});
