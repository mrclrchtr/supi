import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { listReviewFiles, readReviewDiff, readReviewFile, searchReviewFiles } from "../git.ts";
import { REVIEW_LIMITS } from "../review-limits.ts";
import { normalizeReviewSubmission } from "../review-result.ts";
import { formatReviewChange } from "../target/file-manifest.ts";
import type { ReviewSnapshot, ReviewSubmission } from "../types.ts";
import {
  DEFAULT_PAGE_CHARACTERS,
  MAX_PAGE_CHARACTERS,
  MAX_PAGE_LINES,
  pageText,
  selectLineRange,
} from "./output-page.ts";
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

function pagedResult(
  text: string,
  offset?: number,
  limit?: number,
  extraDetails: Record<string, unknown> = {},
) {
  const page = pageText(text, offset, limit);
  return {
    content: [{ type: "text" as const, text: page.text }],
    details: {
      offset: page.offset,
      nextOffset: page.nextOffset,
      totalCharacters: page.totalCharacters,
      ...extraDetails,
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
      name: "list_review_changes",
      label: "List Review Changes",
      description: "List every changed path with Git status and per-file +/- statistics.",
      parameters: Type.Object(paginationProperties, { additionalProperties: false }),
      execute: async (_id, args) =>
        pagedResult(
          snapshot.changes.map((change) => formatReviewChange(change)).join("\n"),
          args.offset,
          args.limit,
        ),
    }),
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
      description:
        "Read the exact target diff. Omit path for the bounded paged full diff, or provide one changed path; oversized full diffs require per-path reads.",
      parameters: Type.Object(
        {
          path: Type.Optional(
            Type.String({ minLength: 1, maxLength: REVIEW_LIMITS.locationPathCharacters }),
          ),
          ...paginationProperties,
        },
        { additionalProperties: false },
      ),
      execute: async (_id, args) =>
        pagedResult(await readReviewDiff(cwd, snapshot, args.path), args.offset, args.limit),
    }),
    defineTool({
      name: "read_review_file",
      label: "Read Review File",
      description:
        "Read a before/after target file. startLine/lineCount select a range; offset pages within that selection.",
      parameters: Type.Object(
        {
          path: Type.String({ minLength: 1, maxLength: REVIEW_LIMITS.locationPathCharacters }),
          side: Type.Optional(
            StringEnum(["before", "after"] as const, {
              default: "after",
              description: "Target side to read; defaults to after.",
            }),
          ),
          startLine: Type.Optional(
            Type.Integer({ minimum: 1, description: "1-based first line to select." }),
          ),
          lineCount: Type.Optional(
            Type.Integer({
              minimum: 1,
              maximum: MAX_PAGE_LINES,
              description: "Lines to select; requires startLine and defaults to 200.",
            }),
          ),
          ...paginationProperties,
        },
        { additionalProperties: false },
      ),
      execute: async (_id, args) => {
        if (args.lineCount !== undefined && args.startLine === undefined) {
          throw new Error("lineCount requires startLine.");
        }
        const content =
          (await readReviewFile(cwd, snapshot, args.path, args.side ?? "after")) ??
          "[file unavailable on this side]";
        if (args.startLine === undefined) {
          return pagedResult(content, args.offset, args.limit);
        }
        const selected = selectLineRange(content, args.startLine, args.lineCount);
        return pagedResult(selected.text, args.offset, args.limit, {
          startLine: selected.startLine,
          endLine: selected.endLine,
          totalLines: selected.totalLines,
        });
      },
    }),
    defineTool({
      name: "search_review_files",
      label: "Search Review Files",
      description:
        "Search before/after target text using literal or extended-regex mode. Use offset to continue.",
      parameters: Type.Object(
        {
          query: Type.String({
            minLength: 1,
            maxLength: REVIEW_LIMITS.searchQueryCharacters,
          }),
          path: Type.Optional(
            Type.String({ minLength: 1, maxLength: REVIEW_LIMITS.locationPathCharacters }),
          ),
          side: Type.Optional(
            StringEnum(["before", "after"] as const, {
              default: "after",
              description: "Target side to search; defaults to after.",
            }),
          ),
          mode: Type.Optional(
            StringEnum(["literal", "regex"] as const, {
              default: "literal",
              description: "Literal or extended regular expression search.",
            }),
          ),
          ...paginationProperties,
        },
        { additionalProperties: false },
      ),
      execute: async (_id, args) =>
        pagedResult(
          (await searchReviewFiles(cwd, snapshot, args.query, {
            path: args.path,
            side: args.side ?? "after",
            mode: args.mode ?? "literal",
          })) || "No matches.",
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
