import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import { buildReviewPacketPreviewData } from "../target/packet.ts";
import type { ReviewPlan } from "../types.ts";

type PreviewScreen = "summary" | "inspector";
type InspectorMode = "overview" | "raw";
type NoticeLevel = "dim" | "warning";

interface PreviewNotice {
  level: NoticeLevel;
  text: string;
}

export interface ReviewPlanPreviewComponentArgs {
  plan: ReviewPlan;
  theme: Theme;
  onDone: (approved: boolean) => void;
  requestRender: () => void;
  exportPrompt?: (prompt: string) => string;
}

const INSPECTOR_VIEWPORT_HEIGHT = 18;
const REVIEW_PROMPT_EXPORT_FILENAME = "supi-review-prompt-latest.txt";

/** Stateful review-plan preview that keeps summary + inspector interaction in one TUI surface. */
export class ReviewPlanPreviewComponent {
  private screen: PreviewScreen = "summary";
  private inspectorMode: InspectorMode = "overview";
  private scrollOffset = 0;
  private notice?: PreviewNotice;
  private readonly exportPrompt: (prompt: string) => string;

  constructor(private readonly args: ReviewPlanPreviewComponentArgs) {
    this.exportPrompt = args.exportPrompt ?? exportReviewPromptToTempFile;
  }

  render(width: number): string[] {
    return this.screen === "summary"
      ? buildSummaryContainer(this.args.theme, this.args.plan, this.notice).render(width)
      : this.renderInspector(width);
  }

  handleInput(data: string): boolean {
    return this.screen === "summary"
      ? this.handleSummaryInput(data)
      : this.handleInspectorInput(data);
  }

  invalidate(): void {}

  private handleSummaryInput(data: string): boolean {
    if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
      this.args.onDone(true);
      return true;
    }
    if (matchesKey(data, Key.escape) || data === "n" || data === "N") {
      this.args.onDone(false);
      return true;
    }
    if (data === "v" || data === "V") {
      this.screen = "inspector";
      this.inspectorMode = "overview";
      this.scrollOffset = 0;
      this.args.requestRender();
      return true;
    }
    if (data === "e" || data === "E") {
      this.exportRawPrompt();
      return true;
    }
    return true;
  }

  private handleInspectorInput(data: string): boolean {
    if (matchesKey(data, Key.escape) || data === "q" || data === "Q") {
      this.screen = "summary";
      this.scrollOffset = 0;
      this.args.requestRender();
      return true;
    }
    if (matchesKey(data, Key.tab)) {
      this.inspectorMode = this.inspectorMode === "overview" ? "raw" : "overview";
      this.scrollOffset = 0;
      this.args.requestRender();
      return true;
    }
    if (data === "e" || data === "E") {
      this.exportRawPrompt();
      return true;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.scrollOffset += 1;
      this.args.requestRender();
      return true;
    }
    if (matchesKey(data, Key.up) || data === "k") {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      this.args.requestRender();
      return true;
    }
    return true;
  }

  private renderInspector(width: number): string[] {
    const safeWidth = Math.max(width, 40);
    const border = this.args.theme.fg("accent", "─".repeat(safeWidth));
    const bodyLines = buildInspectorBodyLines(
      Math.max(20, safeWidth - 4),
      this.args.theme,
      this.args.plan,
      this.inspectorMode,
    );
    const clampedOffset = Math.max(
      0,
      Math.min(this.scrollOffset, Math.max(0, bodyLines.length - INSPECTOR_VIEWPORT_HEIGHT)),
    );
    const visibleLines = bodyLines.slice(clampedOffset, clampedOffset + INSPECTOR_VIEWPORT_HEIGHT);
    const visibleEnd = visibleLines.length > 0 ? clampedOffset + visibleLines.length : 0;
    const lines = [
      border,
      truncateToWidth(
        this.args.theme.fg("accent", this.args.theme.bold("  Review Plan Inspector")),
        safeWidth,
      ),
      truncateToWidth(
        `  Inspector: ${this.inspectorMode === "overview" ? "Overview" : "Raw Prompt"}  •  Tab switch mode`,
        safeWidth,
      ),
    ];

    if (this.notice) {
      lines.push(
        truncateToWidth(`  ${this.args.theme.fg(this.notice.level, this.notice.text)}`, safeWidth),
      );
    }

    lines.push("");
    lines.push(...visibleLines.map((line) => truncateToWidth(line, safeWidth)));
    while (
      visibleLines.length < INSPECTOR_VIEWPORT_HEIGHT &&
      lines.length < INSPECTOR_VIEWPORT_HEIGHT + 6
    ) {
      visibleLines.push("  ");
      lines.push("  ");
    }
    lines.push("");
    lines.push(
      truncateToWidth(
        this.args.theme.fg(
          "dim",
          `  Lines ${bodyLines.length === 0 ? 0 : clampedOffset + 1}-${visibleEnd} of ${bodyLines.length}`,
        ),
        safeWidth,
      ),
    );
    lines.push(
      truncateToWidth(
        this.args.theme.fg(
          "dim",
          "  ↑↓ / j k scroll • tab switch mode • e export raw prompt • q / esc back",
        ),
        safeWidth,
      ),
    );
    lines.push(border);

    return lines;
  }

  private exportRawPrompt(): void {
    try {
      this.notice = {
        level: "dim",
        text: `Exported raw prompt to ${this.exportPrompt(this.args.plan.packet.prompt)}`,
      };
    } catch {
      this.notice = { level: "warning", text: "Unable to export the raw prompt." };
    }
    this.args.requestRender();
  }
}

/** Write the raw reviewer prompt to a stable temp file and return the path. */
export function exportReviewPromptToTempFile(prompt: string): string {
  const path = join(tmpdir(), REVIEW_PROMPT_EXPORT_FILENAME);
  writeFileSync(path, prompt, "utf-8");
  return path;
}

function buildSummaryContainer(theme: Theme, plan: ReviewPlan, notice?: PreviewNotice): Container {
  const { model, snapshot, brief, packet } = plan;
  const container = new Container();
  const accent = (s: string) => theme.fg("accent", s);
  const dim = (s: string) => theme.fg("dim", s);
  const briefParts = [
    `  ${dim("Summary:")}  ${brief.summary}`,
    `  ${dim("Outcome:")}  ${brief.intendedOutcome}`,
  ];

  if (brief.constraints.length > 0) {
    briefParts.push(`  ${dim("Constraints:")}  ${brief.constraints.join("; ")}`);
  }
  if (brief.focusAreas.length > 0) {
    briefParts.push(`  ${dim("Focus:")}  ${brief.focusAreas.join("; ")}`);
  }
  if (brief.riskyFiles.length > 0) {
    briefParts.push(`  ${dim("Risky:")}  ${brief.riskyFiles.join(", ")}`);
  }
  if (brief.unresolvedQuestions.length > 0) {
    briefParts.push(`  ${dim("Questions:")}  ${brief.unresolvedQuestions.join("; ")}`);
  }

  container.addChild(new DynamicBorder((s: string) => accent(s)));
  container.addChild(new Spacer(1));
  container.addChild(new Text(accent(theme.bold("  Review Plan")), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(accent(theme.bold("  ── Metadata ──")), 1, 0));
  container.addChild(
    new Text(
      [
        `  ${dim("Model:")}   ${model.canonicalId}`,
        `  ${dim("Target:")}  ${snapshot.title}`,
        `  ${dim("Kind:")}    ${formatTargetLabel(snapshot.target)}`,
        `  ${dim("Files:")}   ${snapshot.changedFiles.length} changed  ${theme.fg("toolDiffAdded", `+${snapshot.stats.additions}`)}/${theme.fg("toolDiffRemoved", `-${snapshot.stats.deletions}`)}`,
      ].join("\n"),
      1,
      0,
    ),
  );
  container.addChild(new Spacer(1));
  container.addChild(new Text(accent(theme.bold("  ── Session-derived Brief ──")), 1, 0));
  container.addChild(new Text(briefParts.join("\n"), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(new Text(buildPromptPreviewHeader(theme, packet.prompt), 1, 0));
  container.addChild(new Text(buildPromptPreviewBody(theme, packet.prompt), 1, 0));
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `  Diffs: on-demand via read_snapshot_diff  •  Files: ${snapshot.changedFiles.length} changed`,
      ),
      1,
      0,
    ),
  );
  container.addChild(new Spacer(1));

  if (notice) {
    container.addChild(new Text(`  ${theme.fg(notice.level, notice.text)}`, 1, 0));
    container.addChild(new Spacer(1));
  }

  container.addChild(
    new Text(
      `  ${dim("Enter")} ${theme.fg("success", "Run review")}  ${dim("•")}  ${dim("Esc")} ${theme.fg("muted", "Cancel")}  ${dim("• y/n")}  ${dim("•")}  ${dim("v")} ${theme.fg("accent", "inspect full review plan")}  ${dim("•")}  ${dim("e")} ${theme.fg("accent", "export raw prompt")}`,
      1,
      0,
    ),
  );
  container.addChild(new Spacer(1));
  container.addChild(new DynamicBorder((s: string) => accent(s)));
  return container;
}

function buildPromptPreviewHeader(theme: Theme, prompt: string): string {
  return theme.fg(
    "accent",
    theme.bold(`  ── Reviewer Prompt (${prompt.length.toLocaleString()} chars) ──`),
  );
}

function buildPromptPreviewBody(theme: Theme, prompt: string): string {
  const maxPreview = 2_000;
  if (prompt.length <= maxPreview) return prompt;
  return `${prompt.slice(0, maxPreview)}\n\n${theme.fg("warning", `[Preview truncated — showing ${maxPreview.toLocaleString()} of ${prompt.length.toLocaleString()} total chars]`)}`;
}

function buildInspectorBodyLines(
  width: number,
  theme: Theme,
  plan: ReviewPlan,
  mode: InspectorMode,
): string[] {
  if (mode === "raw") {
    return wrapInspectorLines(plan.packet.prompt.split("\n"), width);
  }

  const preview = buildReviewPacketPreviewData(plan.snapshot, plan.brief.reviewInstructionBlockIds);
  const lines = [
    theme.fg("accent", theme.bold("Summary")),
    `Summary: ${plan.brief.summary}`,
    `Outcome: ${plan.brief.intendedOutcome}`,
    "",
    theme.fg("accent", theme.bold("Snapshot")),
    `Model: ${plan.model.canonicalId}`,
    `Target: ${plan.snapshot.title}`,
    `Kind: ${formatTargetLabel(plan.snapshot.target)}`,
    `Files: ${plan.snapshot.changedFiles.length} changed (+${plan.snapshot.stats.additions} / -${plan.snapshot.stats.deletions})`,
    `Prompt size: ${plan.packet.prompt.length.toLocaleString()} chars`,
    `Packet budget: ${plan.packet.charBudget.toLocaleString()} chars`,
    "",
    theme.fg("accent", theme.bold("Constraints")),
    ...toBulletLines(plan.brief.constraints, "No explicit constraints extracted."),
    "",
    theme.fg("accent", theme.bold("Focus areas")),
    ...toBulletLines(plan.brief.focusAreas, "Review overall correctness and consistency."),
    "",
    theme.fg("accent", theme.bold("Risky files")),
    ...toBulletLines(plan.brief.riskyFiles, "No risky files explicitly called out."),
  ];

  if (plan.brief.unresolvedQuestions.length > 0) {
    lines.push("", theme.fg("accent", theme.bold("Open questions")));
    lines.push(
      ...toBulletLines(plan.brief.unresolvedQuestions, "No unresolved questions identified."),
    );
  }
  if (preview.reviewInstructionBlocks.length > 0) {
    lines.push("", theme.fg("accent", theme.bold("Mandatory review instructions")));
    lines.push(
      ...preview.reviewInstructionBlocks.map((block) => `- ${block.title}: ${block.instruction}`),
    );
  }

  lines.push("", theme.fg("accent", theme.bold("File overview")));
  lines.push(
    ...preview.fileOverview.map((row) =>
      formatFileOverviewRow(row.file, row.additions, row.deletions, row.annotations),
    ),
  );

  if (preview.snapshotNotes) {
    lines.push("", theme.fg("accent", theme.bold("Snapshot notes")), preview.snapshotNotes);
  }

  return wrapInspectorLines(lines, width);
}

function wrapInspectorLines(lines: string[], width: number): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length === 0) {
      wrapped.push("  ");
      continue;
    }
    for (const segment of wrapTextWithAnsi(line, width)) {
      wrapped.push(`  ${segment}`);
    }
  }
  return wrapped;
}

function toBulletLines(items: string[], fallback: string): string[] {
  return items.length > 0 ? items.map((item) => `- ${item}`) : [`- ${fallback}`];
}

function formatFileOverviewRow(
  file: string,
  additions: number | null,
  deletions: number | null,
  annotations: string[],
): string {
  const stats = `+${additions ?? "?"} / -${deletions ?? "?"}`;
  const suffix = annotations.length > 0 ? ` (${annotations.join(", ")})` : "";
  return `- ${file} — ${stats}${suffix}`;
}

function formatTargetLabel(target: ReviewPlan["snapshot"]["target"]): string {
  switch (target.kind) {
    case "working-tree":
      return "Working tree";
    case "branch":
      return `${target.base} ← current`;
    case "commit":
      return `commit ${target.sha.slice(0, 7)}`;
  }
}
