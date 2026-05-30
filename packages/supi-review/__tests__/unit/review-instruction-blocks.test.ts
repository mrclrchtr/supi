import { describe, expect, it } from "vitest";
import {
  listReviewInstructionBlocks,
  resolveReviewInstructionBlocks,
} from "../../src/target/review-instruction-blocks.ts";

describe("review instruction block catalog", () => {
  it("lists the fixed instruction block catalog", () => {
    const blocks = listReviewInstructionBlocks();

    expect(blocks.map((block) => block.id)).toEqual([
      "public-surface",
      "cross-layer",
      "schema-widening",
      "cleanup",
    ]);
  });

  it("returns an empty list when no block ids are selected", () => {
    expect(resolveReviewInstructionBlocks([])).toEqual([]);
  });

  it("resolves selected block ids in order without duplicates", () => {
    const blocks = resolveReviewInstructionBlocks([
      "schema-widening",
      "public-surface",
      "schema-widening",
    ]);

    expect(blocks.map((block) => block.id)).toEqual(["schema-widening", "public-surface"]);
    expect(blocks[0]?.title).toBe("Enum / operation / schema widening audit");
    expect(blocks[1]?.title).toBe("Public-surface / rename / merge audit");
  });

  it("ignores unknown ids and keeps valid selected blocks", () => {
    const ids = ["nonexistent", "public-surface"] as unknown as Parameters<
      typeof resolveReviewInstructionBlocks
    >[0];

    const blocks = resolveReviewInstructionBlocks(ids);

    expect(blocks.map((block) => block.id)).toEqual(["public-surface"]);
  });
});
