import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { ReviewArtifactStore } from "../session/review-artifact-store.ts";
import { renderOutputCall, renderOutputResult } from "../tui/paged-output.ts";
import type { ReviewOutputReference } from "../types.ts";
import { DEFAULT_PAGE_CHARACTERS, MAX_PAGE_CHARACTERS, type TextPage } from "./output-page.ts";

const outputPageSchema = Type.Object(
  {
    artifactId: Type.String({
      minLength: 1,
      maxLength: 128,
      description:
        "Opaque session-scoped id returned by supi_review_prepare or supi_review_run, not a file path.",
    }),
    offset: Type.Optional(
      Type.Integer({
        minimum: 0,
        default: 0,
        description:
          "UTF-16 character offset; omit for the first page, then use returned nextOffset.",
      }),
    ),
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        maximum: MAX_PAGE_CHARACTERS,
        default: DEFAULT_PAGE_CHARACTERS,
        description: "Maximum characters for this page; omit for the default.",
      }),
    ),
  },
  {
    additionalProperties: false,
    description: "Read one page of an output artifact returned by a review or preparation call.",
  },
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
    description: `Read up to ${MAX_PAGE_CHARACTERS} UTF-16 characters from a session-scoped review or preparation output continuation. Use only with an artifact id returned by supi_review_prepare or supi_review_run.`,
    promptSnippet: "Continue paged review output",
    parameters: outputPageSchema,
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
