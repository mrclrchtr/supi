import type { ReviewInstructionBlockId } from "../types.ts";

export interface ReviewInstructionBlock {
  id: ReviewInstructionBlockId;
  title: string;
  instruction: string;
}

const REVIEW_INSTRUCTION_BLOCKS: readonly ReviewInstructionBlock[] = [
  {
    id: "public-surface",
    title: "Public-surface / rename / merge audit",
    instruction:
      "Sweep source, tests, docs, user-facing strings, and debug/status lists for stale public names after renames, removals, or merges.",
  },
  {
    id: "cross-layer",
    title: "Cross-layer propagation audit",
    instruction:
      "Verify every provider/runtime/orchestration/presentation/test handoff and look for at least one end-to-end expectation covering the threaded behavior.",
  },
  {
    id: "schema-widening",
    title: "Enum / operation / schema widening audit",
    instruction:
      "Audit validation, unavailable paths, branch coverage, aliases, and negative tests for widened enums, operations, or schemas.",
  },
  {
    id: "cleanup",
    title: "Cleanup / deletion / orphan audit",
    instruction:
      "Check for orphan files, dead imports or re-exports, stale comments, and outdated expectations after deletions or consumer removals.",
  },
];

/** Return the full fixed catalog of review instruction blocks. */
export function listReviewInstructionBlocks(): readonly ReviewInstructionBlock[] {
  return REVIEW_INSTRUCTION_BLOCKS;
}

/** Resolve a brief-selected block ID list into canonical host-owned prompt blocks. */
export function resolveReviewInstructionBlocks(
  ids: readonly ReviewInstructionBlockId[],
): ReviewInstructionBlock[] {
  const resolved: ReviewInstructionBlock[] = [];
  const seen = new Set<ReviewInstructionBlockId>();

  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const block = REVIEW_INSTRUCTION_BLOCKS.find((b) => b.id === id);
    if (block) resolved.push(block);
  }

  return resolved;
}
