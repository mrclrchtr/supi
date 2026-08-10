import { formatReviewScopeForPlanner } from "../review-scope.ts";
import { buildFileManifest } from "../target/file-manifest.ts";
import type { ReviewScope, ReviewSnapshot } from "../types.ts";

/** Build bounded Planner input from exact target facts and an advisory Review Scope. */
export function buildPlannerPrompt(
  snapshot: ReviewSnapshot,
  scope: ReviewScope,
  context: string,
): string {
  const parts = [
    "# Review Planning Input",
    "",
    `Target: ${snapshot.title}`,
    `Target identity: from=${snapshot.target.fromCommit ?? "none"} to=${snapshot.target.toCommit} include-uncommitted=${snapshot.target.includeUncommittedChanges}`,
    "Every task must set Review Mode to change or state.",
  ];
  if (snapshot.changes.length > 0) {
    parts.push(
      "This target supports change and state tasks. A draft may use mixed modes.",
      `Changed files: ${snapshot.changes.length}`,
      `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
      "",
      "## Changed-path inventory",
      ...buildFileManifest(snapshot.changes),
    );
  } else {
    parts.push("This target has no canonical change. Propose only state tasks.");
  }
  parts.push("", ...formatReviewScopeForPlanner(scope));
  parts.push(
    "",
    "## Bounded session conversation",
    context || "No session conversation was available.",
  );
  return parts.join("\n");
}
