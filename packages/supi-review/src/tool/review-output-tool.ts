import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import type { ReviewOutputReference } from "../types.ts";
import { DEFAULT_PAGE_CHARACTERS, MAX_PAGE_CHARACTERS, type TextPage } from "./output-page.ts";

const outputPageSchema = Type.Object(
  {
    artifactId: Type.String({
      minLength: 1,
      maxLength: 128,
      description: "Session-scoped review output id.",
    }),
    offset: Type.Optional(
      Type.Integer({ minimum: 0, default: 0, description: "UTF-16 character offset." }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_PAGE_CHARACTERS,
        default: DEFAULT_PAGE_CHARACTERS,
        description: "Maximum characters for this page.",
      }),
    ),
  },
  { additionalProperties: false },
);

function modelFacingPage(artifactId: string, page: TextPage): string {
  if (page.nextOffset === undefined) return page.text;
  const marker = "\n\n[output paged;";
  const body = page.text.slice(0, page.text.lastIndexOf(marker));
  const call = JSON.stringify({ artifactId, offset: page.nextOffset });
  return [
    body,
    "",
    `[output paged; call supi_review_output with ${call}; total characters: ${page.totalCharacters}]`,
  ].join("\n");
}

/** Store complete output and return its first bounded model-facing page. */
export function createReviewOutput(
  store: ReviewArtifactStore,
  text: string,
): { text: string; reference: ReviewOutputReference } {
  const artifact = store.create(text);
  const page = store.read(artifact.id);
  if (!page) throw new Error("Review output expired before it could be returned.");
  return {
    text: modelFacingPage(artifact.id, page),
    reference: {
      artifactId: artifact.id,
      offset: page.offset,
      ...(page.nextOffset === undefined ? {} : { nextOffset: page.nextOffset }),
      totalCharacters: page.totalCharacters,
    },
  };
}

/** Register resumable retrieval for preparation and review output artifacts. */
export function registerReviewOutputTool(pi: ExtensionAPI, store: ReviewArtifactStore): void {
  pi.registerTool({
    name: "supi_review_output",
    label: "Read Review Output",
    description: "Read a page of session-scoped review or preparation output.",
    promptSnippet: "Continue paged review output",
    promptGuidelines: [
      "Use supi_review_output only when supi_review_prepare or supi_review_run returns an output continuation.",
    ],
    parameters: outputPageSchema,
    async execute(_id, params) {
      const page = store.read(params.artifactId, params.offset, params.limit);
      if (!page) {
        throw new Error(
          `Review output ${params.artifactId} was not found or has expired from this session.`,
        );
      }
      return {
        content: [{ type: "text" as const, text: modelFacingPage(params.artifactId, page) }],
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
  pi.on("session_shutdown", () => store.clear());
}
