import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTool } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { createReviewOutput, registerReviewOutputTool } from "../../src/tool/review-output-tool.ts";

function textContent(result: unknown): string {
  const value = result as { content?: Array<{ text?: string }> };
  return value.content?.[0]?.text ?? "";
}

describe("supi_review_output", () => {
  it("returns a directly callable continuation and retrieves the requested page", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const source = "x".repeat(20_000);

    const first = createReviewOutput(store, source);
    expect(first.reference.nextOffset).toBeDefined();
    expect(first.text).toContain("call supi_review_output with");
    expect(first.text).toContain(first.reference.artifactId);

    const tool = getTool(pi, "supi_review_output");
    expect(tool.description).toContain("supi_review_run or /supi-review");
    expect(JSON.stringify(tool.parameters)).toContain("agent or interactive Review");
    expect(JSON.stringify(tool.parameters)).not.toMatch(/prepare|prepared/i);
    const next = await tool.execute("call", {
      artifactId: first.reference.artifactId,
      offset: first.reference.nextOffset,
    });

    expect(textContent(next).startsWith("x".repeat(100))).toBe(true);
  });

  it("expires process-local continuations on branch changes", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const output = createReviewOutput(store, "review");

    await getHandlerOrThrow(pi, "session_tree")({} as never, {} as never);

    expect(store.read(output.reference.artifactId)).toBeUndefined();
  });

  it("throws an actionable error for an unknown artifact", async () => {
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, new ReviewArtifactStore());

    await expect(
      getTool(pi, "supi_review_output").execute("call", { artifactId: "missing" }),
    ).rejects.toThrow(/not found or has expired/i);
  });
});
