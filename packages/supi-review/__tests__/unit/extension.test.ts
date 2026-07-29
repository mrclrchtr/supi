import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getTool } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import reviewExtension from "../../src/review.ts";

describe("supi-review extension", () => {
  it("registers preparation, run, resumable output, and review commands", () => {
    const pi = createPiMock();
    reviewExtension(pi as unknown as ExtensionAPI);

    expect(getTool(pi, "supi_review_prepare")).toBeDefined();
    expect(getTool(pi, "supi_review_run")).toBeDefined();
    expect(getTool(pi, "supi_review_output")).toBeDefined();
    expect(pi.commands.has("supi-review")).toBe(true);
    expect(pi.commands.has("supi-review-cleanup")).toBe(true);
  });
});
