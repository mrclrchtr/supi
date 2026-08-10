import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import { renderOutputCall, renderOutputResult } from "../tui/paged-output.ts";
import type { ReviewOutputReference } from "../types.ts";
import { modelFacingPage } from "./output-page.ts";
import { REVIEW_TOOL_SPECS } from "./tool-specs.ts";

interface ReviewOutputOptions {
  firstPageCharacters?: number;
  firstPageLines?: number;
}

/** Store complete output and return its first bounded model-facing page. */
export function createReviewOutput(
  store: ReviewArtifactStore,
  text: string,
  options: ReviewOutputOptions = {},
): { text: string; reference: ReviewOutputReference } {
  const artifact = store.create(text);
  const page = store.read(
    artifact.id,
    undefined,
    options.firstPageCharacters,
    options.firstPageLines,
  );
  if (!page) throw new Error("Review output expired before it could be returned.");
  return {
    text: modelFacingPage(REVIEW_TOOL_SPECS.output.name, { artifactId: artifact.id }, page),
    reference: {
      artifactId: artifact.id,
      offset: page.offset,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      totalCharacters: page.totalCharacters,
    },
  };
}

/** Register resumable retrieval for agent and interactive Review output artifacts. */
export function registerReviewOutputTool(pi: ExtensionAPI, store: ReviewArtifactStore): void {
  const spec = REVIEW_TOOL_SPECS.output;
  pi.registerTool({
    ...spec,
    promptGuidelines: [...spec.promptGuidelines],
    renderCall: renderOutputCall,
    renderResult: renderOutputResult,
    async execute(_id, params) {
      const page = store.read(params.artifactId, params.offset, params.limit);
      if (!page) {
        throw new Error(
          `Review output ${params.artifactId} was not found or has expired from this session.`,
        );
      }
      return {
        content: [
          {
            type: "text" as const,
            text: modelFacingPage(spec.name, { artifactId: params.artifactId }, page),
          },
        ],
        details: {
          kind: "review-output-page" as const,
          artifactId: params.artifactId,
          offset: page.offset,
          ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
          totalCharacters: page.totalCharacters,
        },
      };
    },
  });

  pi.on("session_start", () => store.clear());
  pi.on("session_tree", () => store.clear());
  pi.on("session_shutdown", () => store.clear());
}
