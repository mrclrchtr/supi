import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listReviewFiles, readReviewDiff, readReviewFile, searchReviewFiles } from "../git.ts";
import { normalizeReviewSubmission } from "../review-result.ts";
import type { ReviewSnapshot, ReviewSubmission } from "../types.ts";
import { DEFAULT_PAGE_CHARACTERS, MAX_PAGE_CHARACTERS, pageText } from "./output-page.ts";
import { reviewSubmissionSchema } from "./schemas.ts";

const paginationProperties = {
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
};

function pagedResult(text: string, offset?: number, limit?: number) {
  const page = pageText(text, offset, limit);
  return {
    content: [{ type: "text" as const, text: page.text }],
    details: {
      offset: page.offset,
      nextOffset: page.nextOffset,
      totalCharacters: page.totalCharacters,
    },
  };
}

/** Build the complete fixed tool set for one resolved review target. */
export function createReviewTools(
  cwd: string,
  snapshot: ReviewSnapshot,
  submission: { value?: ReviewSubmission },
) {
  return [
    defineTool({
      name: "list_review_files",
      label: "List Review Files",
      description: "List after-side target files. Use offset to continue paged output.",
      parameters: Type.Object(paginationProperties, { additionalProperties: false }),
      execute: async (_id, args) =>
        pagedResult((await listReviewFiles(cwd, snapshot)).join("\n"), args.offset, args.limit),
    }),
    defineTool({
      name: "read_review_diff",
      label: "Read Review Diff",
      description: "Read one changed file's exact target diff. Use offset to continue.",
      parameters: Type.Object(
        { path: Type.String({ minLength: 1 }), ...paginationProperties },
        { additionalProperties: false },
      ),
      execute: async (_id, args) =>
        pagedResult(await readReviewDiff(cwd, snapshot, args.path), args.offset, args.limit),
    }),
    defineTool({
      name: "read_review_file",
      label: "Read Review File",
      description: "Read a before/after target file. Use offset to continue paged output.",
      parameters: Type.Object(
        {
          path: Type.String({ minLength: 1 }),
          side: Type.Optional(
            StringEnum(["before", "after"] as const, {
              default: "after",
              description: "Target side to read; defaults to after.",
            }),
          ),
          ...paginationProperties,
        },
        { additionalProperties: false },
      ),
      execute: async (_id, args) => {
        const content = await readReviewFile(cwd, snapshot, args.path, args.side ?? "after");
        return pagedResult(content ?? "[file unavailable on this side]", args.offset, args.limit);
      },
    }),
    defineTool({
      name: "search_review_files",
      label: "Search Review Files",
      description: "Search literal after-side target text. Use offset to continue paged output.",
      parameters: Type.Object(
        {
          query: Type.String({ minLength: 1 }),
          path: Type.Optional(Type.String({ minLength: 1 })),
          ...paginationProperties,
        },
        { additionalProperties: false },
      ),
      execute: async (_id, args) =>
        pagedResult(
          (await searchReviewFiles(cwd, snapshot, args.query, args.path)) || "No matches.",
          args.offset,
          args.limit,
        ),
    }),
    defineTool({
      name: "submit_review",
      label: "Submit Review",
      description: "Submit the final structured result for this review task.",
      parameters: reviewSubmissionSchema,
      execute: async (_id, args) => {
        const { verdict: _, ...normalized } = normalizeReviewSubmission(args as ReviewSubmission);
        submission.value = normalized;
        return {
          content: [{ type: "text" as const, text: "Review submitted." }],
          details: normalized,
          terminate: true,
        };
      },
    }),
  ];
}
