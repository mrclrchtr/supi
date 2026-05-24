import type { ModelRegistry } from "@earendil-works/pi-coding-agent";
import { runBriefSynthesis } from "../tool/brief-runner.ts";
import type { BriefSynthesisRunResult, ReviewProgress } from "../tool/runner-types.ts";
import type { ReviewModelSelection, ReviewSnapshot } from "../types.ts";

const DIFF_EXCERPT_CHAR_BUDGET = 12_000;

export interface SynthesizeReviewBriefOptions {
  model: ReviewModelSelection;
  modelRegistry: ModelRegistry;
  cwd: string;
  snapshot: ReviewSnapshot;
  serializedContext: string;
  note?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ReviewProgress) => void;
}

/** Synthesize a structured review brief from the current snapshot and session context. */
export function synthesizeReviewBrief(
  options: SynthesizeReviewBriefOptions,
): Promise<BriefSynthesisRunResult> {
  const { model, modelRegistry, cwd, snapshot, serializedContext, note, signal, onProgress } =
    options;

  return runBriefSynthesis({
    prompt: buildBriefSynthesisPrompt(snapshot, serializedContext, note),
    model: model.model,
    modelRegistry,
    cwd,
    signal,
    onProgress,
  });
}

export function buildBriefSynthesisPrompt(
  snapshot: ReviewSnapshot,
  serializedContext: string,
  note?: string,
): string {
  const diffExcerpt = buildDiffExcerpt(snapshot.diffText);
  const parts: string[] = [
    "# Review Brief Synthesis Input",
    "",
    "You are preparing a review brief for a second code-reviewing agent.",
    "Infer the likely goal, constraints, and focus areas from the active session history.",
    "Be concise, evidence-based, and avoid inventing requirements that are not supported by the input.",
    "",
    "## Snapshot",
    `Target: ${snapshot.title}`,
    `Files changed: ${snapshot.changedFiles.length}`,
    `Diff stats: +${snapshot.stats.additions} / -${snapshot.stats.deletions}`,
    "",
    "### Changed files",
    ...snapshot.changedFiles.map((file) => `- ${file}`),
  ];

  if (diffExcerpt.text) {
    parts.push("", "### Diff excerpt", "```diff", diffExcerpt.text, "```");
    if (diffExcerpt.truncated) {
      parts.push(`> Note: diff excerpt truncated to ${diffExcerpt.text.length} characters.`);
    }
  }

  if (note?.trim()) {
    parts.push("", "## User note", note.trim());
  }

  parts.push("", "## Serialized session context");
  if (serializedContext.trim()) {
    parts.push(serializedContext.trim());
  } else {
    parts.push("No session context was available. Derive the brief from the snapshot only.");
  }

  parts.push(
    "",
    "## Output requirements",
    "Call submit_review_brief with:",
    "- summary: one-sentence summary of the likely change",
    "- intendedOutcome: what the session seems to be trying to achieve",
    "- constraints: invariants or requirements to preserve",
    "- focusAreas: what the reviewer should inspect carefully",
    "- riskyFiles: changed files that seem especially important or risky",
    "- unresolvedQuestions: ambiguities or concerns that remain unclear",
  );

  return parts.join("\n");
}

function buildDiffExcerpt(diffText: string): { text: string; truncated: boolean } {
  const trimmed = diffText.trim();
  if (!trimmed) {
    return { text: "", truncated: false };
  }
  if (trimmed.length <= DIFF_EXCERPT_CHAR_BUDGET) {
    return { text: trimmed, truncated: false };
  }
  return {
    text: `${trimmed.slice(0, DIFF_EXCERPT_CHAR_BUDGET)}\n[... diff excerpt truncated ...]`,
    truncated: true,
  };
}
