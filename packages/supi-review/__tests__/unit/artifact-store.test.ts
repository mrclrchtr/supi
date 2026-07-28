import { describe, expect, it } from "vitest";
import { ReviewArtifactStore } from "../../src/session/review-artifact-store.ts";

function body(text: string): string {
  return text.split("\n\n[output paged;")[0] ?? "";
}

describe("ReviewArtifactStore", () => {
  it("reconstructs complete long output through stable session-scoped pages", () => {
    const store = new ReviewArtifactStore();
    const source = Array.from({ length: 2_000 }, (_, index) => `finding-${index}`).join("\n");
    const artifact = store.create(source);
    const chunks: string[] = [];
    let offset = 0;

    for (;;) {
      const page = store.read(artifact.id, offset, 1_000);
      expect(page).toBeDefined();
      if (!page) break;
      chunks.push(body(page.text));
      if (page.nextOffset === undefined) break;
      offset = page.nextOffset;
    }

    expect(chunks.join("")).toBe(source);
    expect(store.read(artifact.id, 0, 1_000)).toBeDefined();
  });

  it("evicts oldest output when the bounded session store is full", () => {
    const store = new ReviewArtifactStore({ maxArtifacts: 1, maxTotalCharacters: 100 });
    const first = store.create("first");
    const second = store.create("second");

    expect(store.read(first.id)).toBeUndefined();
    expect(store.read(second.id)?.text).toBe("second");
  });
});
