import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildSessionContext,
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  type ExtensionAPI,
  formatSize,
  truncateHead,
} from "@earendil-works/pi-coding-agent";
import { recordDebugEvent } from "@mrclrchtr/supi-core/debug";
import { isCommitObjectId, summarizeReviewSnapshot } from "../git.ts";
import { serializeSessionContext } from "../history/collect.ts";
import { getCurrentReviewModel } from "../model.ts";
import { ReviewPlanStore } from "../session/review-plan-store.ts";
import type {
  BriefEvaluation,
  PreparedAgentReviewDetails,
  ReviewProgress,
  ReviewTargetSpec,
} from "../types.ts";
import { formatBriefSynthesisFailureCopy } from "../ui/format-content.ts";
import { formatAgentReviewBatch, formatPreparedAgentReview } from "../ui/review-tool-format.ts";
import {
  type AgentReviewProgressDetails,
  renderPrepareReviewCall,
  renderPrepareReviewResult,
  renderRunReviewCall,
  renderRunReviewResult,
} from "../ui/review-tool-renderer.ts";
import {
  type PrepareAgentReviewInput,
  prepareAgentReviewSchema,
  type RunAgentReviewInput,
  runAgentReviewSchema,
} from "./agent-review-schemas.ts";
import { prepareAgentReviewPlan, runAgentReviewBatch } from "./agent-review-workflow.ts";
import { formatChildLifecycleTrace } from "./child-lifecycle-trace.ts";
import {
  PREPARE_REVIEW_TOOL_NAME,
  prepareReviewPromptGuidelines,
  prepareReviewPromptSnippet,
  prepareReviewToolDescription,
  RUN_REVIEW_TOOL_NAME,
  runReviewToolDescription,
} from "./guidance.ts";

const TOOL_OUTPUT_CONTRACT =
  " Output is truncated at 2,000 lines or 50KB; full Markdown is saved to a temporary file when truncated.";

/** Register the two-stage agent-driven Session-Aware Review tools. */
export function registerAgentReviewTools(
  pi: ExtensionAPI,
  planStore = new ReviewPlanStore(),
): void {
  pi.registerTool({
    name: PREPARE_REVIEW_TOOL_NAME,
    label: "Prepare Review",
    description: prepareReviewToolDescription + TOOL_OUTPUT_CONTRACT,
    promptSnippet: prepareReviewPromptSnippet,
    promptGuidelines: prepareReviewPromptGuidelines,
    parameters: prepareAgentReviewSchema,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as PrepareAgentReviewInput;
      const model = getCurrentReviewModel(ctx);
      if (!model) throw new Error("No current session model is available for review preparation.");

      const target = parseTarget(input);
      const sessionContext = buildSessionContext(
        ctx.sessionManager.getEntries(),
        ctx.sessionManager.getLeafId(),
      );
      const serializedContext = serializeSessionContext(sessionContext.messages);
      const note = input.note?.trim() || undefined;

      pi.events.emit("supi:working:start", { source: "supi-review" });
      try {
        const outcome = await prepareAgentReviewPlan({
          cwd: ctx.cwd,
          target,
          note,
          serializedContext,
          model,
          signal,
          planStore,
          onProgress: (progress) => {
            onUpdate?.({
              content: [{ type: "text", text: "Synthesizing review brief…" }],
              details: prepareProgressDetails(progress),
            });
          },
        });
        if (outcome.kind !== "prepared") {
          throw new Error(formatPreparationFailure(outcome));
        }

        const details: PreparedAgentReviewDetails = {
          kind: "review-prepared",
          planId: outcome.plan.id,
          briefPromptVersion: outcome.plan.briefPromptVersion,
          generatedBrief: outcome.plan.generatedBrief,
          snapshot: summarizeReviewSnapshot(outcome.plan.snapshot),
          snapshotFingerprint: outcome.plan.snapshotFingerprint,
          modelId: outcome.plan.model.canonicalId,
        };
        activateRunTool(pi);
        return toolResult(formatPreparedAgentReview(details), details, PREPARE_REVIEW_TOOL_NAME);
      } finally {
        pi.events.emit("supi:working:end", { source: "supi-review" });
      }
    },
    renderCall(args, theme) {
      return renderPrepareReviewCall(args, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderPrepareReviewResult(result, expanded, theme);
    },
  });

  pi.registerTool({
    name: RUN_REVIEW_TOOL_NAME,
    label: "Run Review",
    description: runReviewToolDescription + TOOL_OUTPUT_CONTRACT,
    parameters: runAgentReviewSchema,
    // biome-ignore lint/complexity/useMaxParams: pi ToolDefinition.execute signature
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const input = params as RunAgentReviewInput;
      const progress = createBatchProgress(input.reviewers.map((reviewer) => reviewer.id.trim()));

      pi.events.emit("supi:working:start", { source: "supi-review" });
      try {
        const outcome = await runAgentReviewBatch({
          cwd: ctx.cwd,
          planId: input.planId,
          critique: input.critique,
          revisedBrief: input.revisedBrief,
          reviewers: input.reviewers,
          signal,
          planStore,
          onBriefEvaluation: (evaluation) => {
            recordBriefCritique(ctx.cwd, evaluation, input.reviewers.length);
          },
          onReviewerProgress: (reviewerId, reviewerProgress) => {
            progress.reviewers[reviewerId] = reviewerProgress;
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `Running reviewers… ${progress.completed}/${progress.total} completed`,
                },
              ],
              details: batchProgressDetails(progress),
            });
          },
          onReviewerDone: (reviewerId) => {
            progress.completed++;
            progress.reviewers[reviewerId] = {
              ...(progress.reviewers[reviewerId] ?? { turns: 0, toolUses: 0 }),
              currentFocus: undefined,
            };
            onUpdate?.({
              content: [
                {
                  type: "text",
                  text: `Running reviewers… ${progress.completed}/${progress.total} completed`,
                },
              ],
              details: batchProgressDetails(progress),
            });
          },
        });
        if (outcome.kind !== "completed") throw new Error(outcome.reason);

        return toolResult(
          formatAgentReviewBatch(outcome.details),
          outcome.details,
          RUN_REVIEW_TOOL_NAME,
        );
      } finally {
        pi.events.emit("supi:working:end", { source: "supi-review" });
      }
    },
    renderCall(args, theme, context) {
      return renderRunReviewCall(args, context.expanded, theme);
    },
    renderResult(result, { expanded }, theme) {
      return renderRunReviewResult(result, expanded, theme);
    },
  });

  pi.on("session_start", () => {
    planStore.clear();
    deactivateRunTool(pi);
  });
  pi.on("session_shutdown", () => {
    planStore.clear();
  });
}

function parseTarget(input: PrepareAgentReviewInput): ReviewTargetSpec {
  const target = input.target;
  if (!target) return { kind: "working-tree" };
  if (target.kind === "working-tree") {
    if (target.base || target.sha) {
      throw new Error('target.base and target.sha must be omitted for "working-tree".');
    }
    return { kind: "working-tree" };
  }
  if (target.kind === "branch") {
    if (target.sha) throw new Error('target.sha must be omitted when target.kind is "branch".');
    const base = target.base?.trim();
    if (!base) throw new Error('target.base is required when target.kind is "branch".');
    if (base.startsWith("-")) {
      throw new Error("target.base must name a local branch, not a Git option.");
    }
    return { kind: "branch", base };
  }
  if (target.base) throw new Error('target.base must be omitted when target.kind is "commit".');
  const sha = target.sha?.trim();
  if (!sha) throw new Error('target.sha is required when target.kind is "commit".');
  if (!isCommitObjectId(sha)) {
    throw new Error("target.sha must be a hexadecimal commit object id (7–64 characters).");
  }
  return { kind: "commit", sha };
}

function formatPreparationFailure(
  outcome: Exclude<Awaited<ReturnType<typeof prepareAgentReviewPlan>>, { kind: "prepared" }>,
): string {
  if (outcome.kind === "no-snapshot") return outcome.reason;

  const { result } = outcome;
  const trace = result.diagnostics?.lifecycleTrace;
  return trace
    ? `${formatBriefSynthesisFailureCopy(result)}\n\n${formatChildLifecycleTrace(trace)}`
    : formatBriefSynthesisFailureCopy(result);
}

function activateRunTool(pi: ExtensionAPI): void {
  const active = pi.getActiveTools();
  if (active.includes(RUN_REVIEW_TOOL_NAME)) return;
  pi.setActiveTools([...active, RUN_REVIEW_TOOL_NAME]);
}

function deactivateRunTool(pi: ExtensionAPI): void {
  const active = pi.getActiveTools();
  if (!active.includes(RUN_REVIEW_TOOL_NAME)) return;
  pi.setActiveTools(active.filter((name) => name !== RUN_REVIEW_TOOL_NAME));
}

function prepareProgressDetails(progress: ReviewProgress): AgentReviewProgressDetails {
  return {
    kind: "review-progress",
    phase: "prepare",
    completed: 0,
    total: 1,
    reviewers: { synthesis: progress },
  };
}

interface BatchProgressState {
  completed: number;
  total: number;
  reviewers: Record<string, ReviewProgress>;
}

function createBatchProgress(reviewerIds: string[]): BatchProgressState {
  return {
    completed: 0,
    total: reviewerIds.length,
    reviewers: Object.fromEntries(
      reviewerIds.map((id) => [id, { turns: 0, toolUses: 0 } satisfies ReviewProgress]),
    ),
  };
}

function batchProgressDetails(progress: BatchProgressState): AgentReviewProgressDetails {
  return {
    kind: "review-progress",
    phase: "review",
    completed: progress.completed,
    total: progress.total,
    reviewers: { ...progress.reviewers },
  };
}

function recordBriefCritique(
  cwd: string,
  evaluation: BriefEvaluation,
  reviewerCount: number,
): void {
  recordDebugEvent({
    source: "supi-review",
    level: "info",
    category: "brief-critique",
    message: `Main agent submitted a brief critique with verdict ${evaluation.critique.verdict}`,
    cwd,
    data: {
      planId: evaluation.planId,
      briefPromptVersion: evaluation.briefPromptVersion,
      verdict: evaluation.critique.verdict,
      findingCount: evaluation.critique.findings.length,
      reviewerCount,
      modelId: evaluation.synthesizerModelId,
      snapshotFingerprint: evaluation.snapshotFingerprint,
    },
    rawData: evaluation,
  });
}

function toolResult<TDetails>(content: string, details: TDetails, toolName: string) {
  const truncation = truncateHead(content, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });
  if (!truncation.truncated) {
    return { content: [{ type: "text" as const, text: truncation.content }], details };
  }

  const dir = mkdtempSync(join(tmpdir(), "supi-review-"));
  const file = join(dir, `${toolName}.md`);
  writeFileSync(file, content, { encoding: "utf-8", mode: 0o600 });
  const note =
    `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines ` +
    `(${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}). ` +
    `Full output saved to: ${file}]`;
  return {
    content: [{ type: "text" as const, text: truncation.content + note }],
    details,
  };
}
