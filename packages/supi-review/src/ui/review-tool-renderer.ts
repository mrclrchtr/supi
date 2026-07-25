import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { PrepareAgentReviewInput, RunAgentReviewInput } from "../tool/agent-review-schemas.ts";
import type {
  AgentReviewBatchDetails,
  PreparedAgentReviewDetails,
  ReviewProgress,
} from "../types.ts";
import { formatBrief, formatCritique } from "./review-tool-format.ts";

type ReviewTheme = Parameters<Parameters<ExtensionAPI["registerMessageRenderer"]>[1]>[2];

interface ToolResultLike {
  content: Array<{ type: string; text?: string }>;
  details?: unknown;
}

/** Partial tool-result details used while synthesis or reviewer sessions are active. */
export interface AgentReviewProgressDetails {
  kind: "review-progress";
  phase: "prepare" | "review";
  completed: number;
  total: number;
  reviewers?: Record<string, ReviewProgress>;
}

export function renderPrepareReviewCall(args: PrepareAgentReviewInput, theme: ReviewTheme): Text {
  const target = args.target?.kind ?? "working-tree";
  const ref = args.target?.base ?? args.target?.sha;
  const suffix = ref ? ` (${ref})` : "";
  return new Text(
    `${theme.fg("toolTitle", theme.bold("supi_review_prepare "))}${theme.fg("accent", target)}${theme.fg("dim", suffix)}`,
    0,
    0,
  );
}

export function renderPrepareReviewResult(
  result: ToolResultLike,
  expanded: boolean,
  theme: ReviewTheme,
): Container | Text {
  const details = result.details as
    | PreparedAgentReviewDetails
    | AgentReviewProgressDetails
    | undefined;
  if (details?.kind === "review-progress") {
    return new Text(theme.fg("warning", "Synthesizing review brief…"), 0, 0);
  }
  if (details?.kind !== "review-prepared") return fallbackResult(result, theme);

  const container = new Container();
  container.addChild(
    new Text(
      `${theme.fg("success", "✓")} ${theme.fg("toolTitle", theme.bold("Review brief prepared"))}`,
      0,
      0,
    ),
  );
  container.addChild(new Text(theme.fg("dim", `Plan: ${details.planId}`), 0, 0));
  container.addChild(new Text(theme.fg("dim", `Snapshot: ${details.snapshot.title}`), 0, 0));
  container.addChild(
    new Text(theme.fg("muted", `Summary: ${details.generatedBrief.summary}`), 0, 0),
  );
  container.addChild(
    new Text(theme.fg("warning", "Main-agent critique required before run"), 0, 0),
  );

  if (expanded) {
    container.addChild(new Spacer(1));
    for (const line of formatBrief(details.generatedBrief)) {
      container.addChild(new Text(theme.fg("dim", line), 0, 0));
    }
  }
  return container;
}

export function renderRunReviewCall(
  args: RunAgentReviewInput,
  expanded: boolean,
  theme: ReviewTheme,
): Container | Text {
  const verdictColor = args.critique.verdict === "revise" ? "warning" : "success";
  const header = `${theme.fg("toolTitle", theme.bold("supi_review_run "))}${theme.fg(verdictColor, args.critique.verdict)}${theme.fg("dim", ` · ${args.critique.findings.length} critique finding(s) · ${args.reviewers.length} reviewer(s)`)}`;
  if (!expanded) return new Text(header, 0, 0);

  const container = new Container();
  container.addChild(new Text(header, 0, 0));
  for (const line of formatCritique(args.critique)) {
    container.addChild(new Text(theme.fg("dim", line), 0, 0));
  }
  if (args.revisedBrief) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("accent", "Proposed revised brief"), 0, 0));
    for (const line of formatBrief(args.revisedBrief)) {
      container.addChild(new Text(theme.fg("dim", line), 0, 0));
    }
  }
  container.addChild(new Spacer(1));
  for (const reviewer of args.reviewers) {
    container.addChild(new Text(theme.fg("muted", `${reviewer.id}: ${reviewer.focus}`), 0, 0));
  }
  return container;
}

export function renderRunReviewResult(
  result: ToolResultLike,
  expanded: boolean,
  theme: ReviewTheme,
): Container | Text {
  const details = result.details as
    | AgentReviewBatchDetails
    | AgentReviewProgressDetails
    | undefined;
  if (details?.kind === "review-progress") {
    return renderProgress(details, theme);
  }
  if (details?.kind !== "review-batch") return fallbackResult(result, theme);

  const container = new Container();
  const successCount = details.results.filter((entry) => entry.result.kind === "success").length;
  const verdictColor = details.evaluation.critique.verdict === "revise" ? "warning" : "success";
  container.addChild(
    new Text(
      `${theme.fg("success", "✓")} ${theme.fg("toolTitle", theme.bold("Review batch complete"))}${theme.fg("dim", ` · ${successCount}/${details.results.length} succeeded`)}`,
      0,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        verdictColor,
        `Brief ${details.evaluation.critique.verdict}: ${details.evaluation.critique.summary}`,
      ),
      0,
      0,
    ),
  );

  for (const entry of details.results) {
    const status = summarizeResult(entry.result);
    container.addChild(
      new Text(
        `${theme.fg(status.color, status.icon)} ${entry.assignment.id}: ${status.text}`,
        0,
        0,
      ),
    );
  }

  if (expanded) {
    container.addChild(new Spacer(1));
    for (const line of formatCritique(details.evaluation.critique)) {
      container.addChild(new Text(theme.fg("dim", line), 0, 0));
    }
    if (details.evaluation.critique.verdict === "revise") {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("accent", "Effective revised brief"), 0, 0));
      for (const line of formatBrief(details.evaluation.effectiveBrief)) {
        container.addChild(new Text(theme.fg("dim", line), 0, 0));
      }
    }
  }
  return container;
}

function renderProgress(details: AgentReviewProgressDetails, theme: ReviewTheme): Text {
  if (details.phase === "prepare") {
    return new Text(theme.fg("warning", "Synthesizing review brief…"), 0, 0);
  }
  return new Text(
    theme.fg("warning", `Running reviewers… ${details.completed}/${details.total} completed`),
    0,
    0,
  );
}

function summarizeResult(result: AgentReviewBatchDetails["results"][number]["result"]): {
  icon: string;
  color: "success" | "warning" | "error";
  text: string;
} {
  switch (result.kind) {
    case "success":
      return {
        icon: "✓",
        color: result.output.items.length > 0 ? "warning" : "success",
        text: `${result.output.items.length} item(s), ${result.output.overall_correctness}`,
      };
    case "failed":
      return { icon: "✗", color: "error", text: result.reason };
    case "canceled":
      return { icon: "○", color: "warning", text: "canceled" };
    case "timeout":
      return { icon: "◷", color: "warning", text: "timed out" };
  }
}

function fallbackResult(result: ToolResultLike, theme: ReviewTheme): Text {
  const content = result.content.find((part) => part.type === "text")?.text ?? "No review output";
  return new Text(theme.fg("dim", content), 0, 0);
}
