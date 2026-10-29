import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createPiMock, getHandlerOrThrow, getTool } from "@mrclrchtr/supi-test-utils";
import { describe, expect, it } from "vitest";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";
import { createReviewOutput } from "../../src/tool/output-page.ts";
import { registerReviewOutputTool } from "../../src/tool/review_output/register.ts";
import { expectStructuredContent } from "../helpers/structured-result.ts";

function textContent(result: unknown): string {
  const value = result as { content?: Array<{ text?: string }> };
  return value.content?.[0]?.text ?? "";
}

describe("review_output", () => {
  it("returns a directly callable continuation and retrieves the requested page", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const source = "x".repeat(20_000);

    const first = createReviewOutput(store, source);
    expect(first.reference.nextOffset).toBeDefined();
    expect(first.text).toContain(first.reference.artifactId);

    const tool = getTool(pi, "review_output");
    const next = await tool.execute("call", {
      artifactId: first.reference.artifactId,
      offset: first.reference.nextOffset,
    });

    expect(textContent(next).startsWith("x".repeat(100))).toBe(true);
  });

  it("returns the complete native report independently of the bounded direct-call page", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const source = `${"report line 😀\n".repeat(2_000)}END OF REPORT`;
    const artifact = store.create(source);
    const tool = getTool(pi, "review_output");

    for (const offset of [0, 1_024, source.length]) {
      const result = await tool.execute("call", { artifactId: artifact.id, offset, limit: 512 });
      expect(expectStructuredContent(tool, result)).toEqual({
        artifactId: artifact.id,
        text: source,
        totalCharacters: source.length,
      });
      expect((result as { details: unknown }).details).toMatchObject({
        kind: "review-output-page",
        artifactId: artifact.id,
        offset,
        totalCharacters: source.length,
      });
      expect(textContent(result).length).toBeLessThanOrEqual(512);
      if (offset === source.length) expect(textContent(result)).toBe("[no content]");
      else expect(textContent(result)).toContain("[output paged; call review_output");
    }
  });

  it("expires process-local continuations on branch changes", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const output = createReviewOutput(store, "review");

    await getHandlerOrThrow(pi, "session_tree")({} as never, {} as never);

    expect(store.read(output.reference.artifactId)).toBeUndefined();
  });

  it("returns an empty native report while retaining the direct-call empty marker", async () => {
    const store = new ReviewArtifactStore();
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const artifact = store.create("");
    const tool = getTool(pi, "review_output");
    const result = await tool.execute("call", { artifactId: artifact.id });
    expect(expectStructuredContent(tool, result)).toEqual({
      artifactId: artifact.id,
      text: "",
      totalCharacters: 0,
    });
    expect(textContent(result)).toBe("[no content]");
  });

  it("keeps expiry, eviction, and invalid paging as thrown failures", async () => {
    let now = 0;
    const store = new ReviewArtifactStore({ maxArtifacts: 1, maxAgeMs: 10, now: () => now });
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, store);
    const tool = getTool(pi, "review_output");
    const evicted = store.create("first");
    const artifact = store.create("second");
    await expect(tool.execute("call", { artifactId: evicted.id })).rejects.toThrow(
      "not found or has expired",
    );
    await expect(tool.execute("call", { artifactId: artifact.id, offset: 7 })).rejects.toThrow(
      "Offset must be an integer",
    );
    await expect(tool.execute("call", { artifactId: artifact.id, limit: 1 })).rejects.toThrow(
      "Limit must be an integer",
    );
    now = 10;
    await expect(tool.execute("call", { artifactId: artifact.id })).rejects.toThrow(
      "not found or has expired",
    );
  });

  it("throws an actionable error for an unknown artifact", async () => {
    const pi = createPiMock();
    registerReviewOutputTool(pi as unknown as ExtensionAPI, new ReviewArtifactStore());

    await expect(
      getTool(pi, "review_output").execute("call", { artifactId: "missing" }),
    ).rejects.toThrow(/not found or has expired/i);
  });
});
