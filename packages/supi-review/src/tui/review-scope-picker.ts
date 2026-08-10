import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { normalizeReviewScope } from "../review-scope.ts";
import type { ReviewScope } from "../types.ts";

type CommandContext = Parameters<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>[1];

const REPOSITORY_WIDE_REVIEW = "Repository-wide review";
const PATH_FOCUS_REVIEW = "Path focus (one path per line)";

/** Format the selected batch Review Scope for the interactive confirmation. */
export function formatInteractiveReviewScope(scope: ReviewScope): string {
  const paths = scope.paths ?? [];
  return paths.length === 0
    ? REPOSITORY_WIDE_REVIEW.toLowerCase()
    : `path focus: ${paths.join(", ")}`;
}

/** Select and normalize the single advisory Review Scope for the complete batch. */
export async function selectInteractiveReviewScope(
  ctx: CommandContext,
): Promise<ReviewScope | undefined> {
  const choice = await ctx.ui.select("Review Scope", [REPOSITORY_WIDE_REVIEW, PATH_FOCUS_REVIEW]);
  if (!choice) return undefined;
  if (choice === REPOSITORY_WIDE_REVIEW) return {};
  if (choice !== PATH_FOCUS_REVIEW) return undefined;

  const source = await ctx.ui.editor(
    "Review Scope paths (one workspace-relative path per line)",
    "",
  );
  if (source === undefined) return undefined;
  try {
    return normalizeReviewScope({ paths: source.split("\n") });
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : "Invalid Review Scope.", "error");
    return undefined;
  }
}
