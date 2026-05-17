import { getProfile } from "./profiles.ts";
import type { BuildPromptOptions } from "./prompts.ts";
import { buildReviewPrompt } from "./prompts.ts";
import type { ReviewBrief, ReviewTarget } from "./types.ts";

// ── Dynamic brief construction ───────────────────────────────────

export interface DynamicBriefInputs {
  summary: string;
  intent: string;
  focus: string;
}

/**
 * Build a dynamic review brief from structured user inputs.
 * The finalPrompt field is empty — it must be set later by the caller
 * via `assembleReviewerPrompt()` or explicitly assigned.
 */
export function buildDynamicBrief(inputs: DynamicBriefInputs): ReviewBrief {
  const title = `Review: ${inputs.summary}`;
  return {
    mode: "dynamic",
    title,
    summary: inputs.summary,
    intent: inputs.intent,
    focus: inputs.focus,
    finalPrompt: "",
  };
}

// ── Standard brief construction ──────────────────────────────────

/**
 * Build a standard review brief from a named profile.
 * The summary/intent/focus are derived from the profile definition.
 * The finalPrompt field is empty — it must be set later by the caller
 * via `assembleReviewerPrompt()` or explicitly assigned.
 */
export function buildStandardBrief(profileId: string): ReviewBrief {
  const profile = getProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown profile: "${profileId}"`);
  }
  return {
    mode: "standard",
    title: `${profile.label} Review`,
    summary: profile.description,
    intent: profile.description,
    focus: profile.label,
    profileId: profile.id,
    finalPrompt: "",
  };
}

// ── Prompt assembly ──────────────────────────────────────────────

/**
 * Assemble the full reviewer prompt from a review brief and target.
 *
 * The output has two sections:
 * 1. **Review Request** — the brief's summary, intent, focus, and profile (if standard)
 * 2. **Changes to review** — the existing target preamble + diff/custom instructions
 */
export function assembleReviewerPrompt(
  brief: ReviewBrief,
  target: ReviewTarget,
  diff: string = "",
  options?: BuildPromptOptions,
): string {
  const parts: string[] = [];

  // Review request summary from the brief
  parts.push("## Review Request");
  parts.push("");
  parts.push(`**Summary:** ${brief.summary}`);
  parts.push(`**Intended outcome:** ${brief.intent}`);
  parts.push(`**Focus areas:** ${brief.focus}`);
  if (brief.mode === "standard" && brief.profileId) {
    parts.push(`**Review profile:** ${brief.profileId}`);
  }
  parts.push("");

  // Existing target preamble + diff
  parts.push(buildReviewPrompt(target, diff, options));

  return parts.join("\n");
}

/**
 * Build a fully resolved brief by assembling the prompt and setting
 * the finalPrompt field. Used after the brief has been approved.
 */
export function resolveBrief(
  brief: ReviewBrief,
  target: ReviewTarget,
  diff: string = "",
  options?: BuildPromptOptions,
): ReviewBrief {
  const finalPrompt = assembleReviewerPrompt(brief, target, diff, options);
  return { ...brief, finalPrompt };
}
