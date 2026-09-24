import type { Usage } from "@earendil-works/pi-ai";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AgentConversationView } from "../tool/agent_run/conversation-view.ts";
import type { BatchTaskStatus } from "../tool/agent_run/registry.ts";
import { renderConversationEntry } from "../tool/agent_run/render.ts";
import type {
  AgentsOverlayData,
  AgentsOverlayProfile,
  AgentsOverlayRun,
} from "./agents-overlay-data.ts";
import type { AgentRunBlock } from "./agents-run-viewport.ts";

/** Center a legend row using visible terminal columns, with clipping on narrow screens. */
export function centerLegend(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width - 2));
  const padding = Math.max(0, Math.floor((width - visibleWidth(clipped)) / 2));
  return `${" ".repeat(padding)}${clipped}`;
}

const LIST_WINDOW_SIZE = 8;
const MAX_OVERLAY_RESULT_CHARS = 4_000;
const MAX_OVERLAY_RESULT_LINES = 8;

interface RunSectionOptions {
  container: Container;
  data: AgentsOverlayData;
  selectedIndex: number;
  width: number;
  listRows: number;
  theme: Theme;
  conversationBlocks?: readonly AgentRunBlock[];
}

/** Add fixed run rows and return scrollable details with stable conversation positions. */
export function renderRunsSection(options: RunSectionOptions): AgentRunBlock[] {
  const { container, data, selectedIndex, width, listRows, theme } = options;
  if (data.runs.length === 0) {
    return [
      {
        key: -2,
        lines: new Text(theme.fg("dim", "No Agent Runs in this session."), 1, 0).render(width),
      },
    ];
  }
  const start = windowStart(data.runs.length, selectedIndex, listRows);
  for (const [index, run] of data.runs.slice(start, start + listRows).entries()) {
    const row = renderRunRow(run, start + index === selectedIndex, theme);
    container.addChild(new Text(truncateToWidth(row, Math.max(1, width - 2)), 1, 0));
  }
  const run = data.runs[selectedIndex];
  if (!run) return [];
  const details = new Container();
  details.addChild(new Text(theme.fg("accent", theme.bold("Selected task")), 1, 0));
  renderRunMetadata(details, run, theme);
  renderRunResult(details, run, theme);
  details.addChild(new Spacer(1));
  return [
    { key: -2, lines: details.render(width) },
    ...(options.conversationBlocks ?? renderConversationBlocks(run.conversationView, width, theme)),
  ];
}

/** Render effective Agent Profiles with human-only source provenance. */
export function renderProfilesSection(
  container: Container,
  data: AgentsOverlayData,
  selectedIndex: number,
  theme: Theme,
): void {
  container.addChild(new Text(theme.fg("accent", theme.bold("Effective Agent Profiles")), 1, 0));
  if (data.profiles.length === 0) {
    container.addChild(new Text(theme.fg("dim", "No effective profiles."), 1, 0));
    return;
  }
  for (const [index, profile] of visibleWindow(data.profiles, selectedIndex).entries()) {
    const actualIndex = windowStart(data.profiles.length, selectedIndex) + index;
    const selected = actualIndex === selectedIndex;
    const label = `${selected ? "▶" : " "} ${profile.id} — ${profile.source ?? "unavailable"}`;
    container.addChild(
      new Text(selected ? theme.fg("accent", label) : theme.fg("dim", label), 1, 0),
    );
  }
  const profile = data.profiles[selectedIndex];
  if (profile) renderProfileDetails(container, profile, theme);
  if (data.omittedProfileCount > 0) {
    const noun = data.omittedProfileCount === 1 ? "profile" : "profiles";
    container.addChild(
      new Text(
        theme.fg(
          "warning",
          `${data.omittedProfileCount} additional ${noun} omitted by the catalogue limit.`,
        ),
        1,
        0,
      ),
    );
  }
}

/** Render bounded Profile Diagnostics and their omission disclosure. */
export function renderDiagnosticsSection(
  container: Container,
  data: AgentsOverlayData,
  selectedIndex: number,
  theme: Theme,
): void {
  container.addChild(new Text(theme.fg("accent", theme.bold("Profile Diagnostics")), 1, 0));
  if (data.diagnostics.length === 0) {
    container.addChild(new Text(theme.fg("success", "No Profile Diagnostics."), 1, 0));
    addDiagnosticOmission(container, data.omittedDiagnosticCount, theme);
    return;
  }
  for (const [index, diagnostic] of visibleWindow(data.diagnostics, selectedIndex).entries()) {
    const actualIndex = windowStart(data.diagnostics.length, selectedIndex) + index;
    const selected = actualIndex === selectedIndex;
    const label = `${selected ? "▶" : " "} ${diagnostic.profileId} · ${diagnostic.code}`;
    container.addChild(
      new Text(selected ? theme.fg("accent", label) : theme.fg("dim", label), 1, 0),
    );
  }
  const diagnostic = data.diagnostics[selectedIndex];
  if (diagnostic) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(`${diagnostic.source} · ${diagnostic.code}`, 1, 0));
    container.addChild(new Text(diagnostic.message, 1, 0));
    if (diagnostic.directory) {
      container.addChild(new Text(theme.fg("dim", diagnostic.directory), 1, 0));
    }
  }
  addDiagnosticOmission(container, data.omittedDiagnosticCount, theme);
}

function renderRunRow(run: AgentsOverlayRun, selected: boolean, theme: Theme): string {
  const scope = run.active ? "active" : "last";
  const metrics = `${run.turns} turns · ${run.toolUses} tools`;
  const line = `${selected ? theme.fg("accent", "▶") : " "} ${statusIcon(run.status, theme)} ${run.taskId} (${run.profileId}) · ${run.status} · ${metrics} · ${scope}`;
  return selected ? theme.fg("accent", line) : theme.fg("dim", line);
}

function renderRunMetadata(container: Container, run: AgentsOverlayRun, theme: Theme): void {
  const status = run.failureCode ? `${run.status} (${run.failureCode})` : run.status;
  container.addChild(
    new Text(
      `${statusIcon(run.status, theme)} ${status} · ${run.modelId ?? "model unavailable"} · thinking ${run.thinkingLevel ?? "unavailable"}`,
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg("dim", `${run.turns} turns · ${run.toolUses} tool uses${formatUsage(run.usage)}`),
      1,
      0,
    ),
  );
  if (run.taskMetadata) {
    container.addChild(new Text(`Instructions: ${run.taskMetadata.instructions}`, 1, 0));
  }
  if (run.sharedContext) {
    container.addChild(new Text(`Shared context: ${run.sharedContext}`, 1, 0));
  }
  const activity = run.recentActivity?.at(-1);
  if (activity) {
    container.addChild(new Text(theme.fg("dim", `Recent activity: ${activity}`), 1, 0));
  }
  const truncation = [
    run.humanTruncated ? "human output truncated" : undefined,
    run.modelTruncated ? "model output truncated" : undefined,
  ].filter(Boolean);
  if (truncation.length > 0) {
    container.addChild(new Text(theme.fg("warning", truncation.join(" · ")), 1, 0));
  }
}

function renderRunResult(container: Container, run: AgentsOverlayRun, theme: Theme): void {
  if (run.status !== "completed" || run.finalText === undefined) return;
  const bounded = boundOverlayResult(run.finalText);
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("accent", theme.bold("Result")), 1, 0));
  container.addChild(
    new Text(
      theme.fg("muted", bounded.text.trim() ? bounded.text : "No final output retained."),
      1,
      0,
    ),
  );
  if (bounded.truncated) {
    container.addChild(
      new Text(
        theme.fg(
          "warning",
          "Result shortened for overlay; expand the Agent Run output for the full text.",
        ),
        1,
        0,
      ),
    );
  }
}

function boundOverlayResult(text: string): { text: string; truncated: boolean } {
  const characterBound = text.length > MAX_OVERLAY_RESULT_CHARS;
  const characterText = text.slice(0, MAX_OVERLAY_RESULT_CHARS).replace(/\r\n?/g, "\n");
  const trimmedText = characterText.trimEnd();
  const lines = trimmedText ? trimmedText.split("\n") : [];
  const lineBound = lines.length > MAX_OVERLAY_RESULT_LINES;
  return {
    text: lines.slice(0, MAX_OVERLAY_RESULT_LINES).join("\n"),
    truncated: characterBound || lineBound,
  };
}

function renderConversationBlocks(
  view: AgentConversationView | undefined,
  width: number,
  theme: Theme,
): AgentRunBlock[] {
  const conversation = new Container();
  conversation.addChild(new Text(theme.fg("accent", theme.bold("Conversation")), 1, 0));
  renderConversationNotice(conversation, view, theme);
  return [
    { key: -1, lines: conversation.render(width) },
    ...(view?.entries.map((entry, index) => ({
      key: view.omittedEntryCount + index,
      lines: new Text(renderConversationEntry(entry, theme), 1, 0).render(width),
    })) ?? []),
  ];
}

function renderConversationNotice(
  container: Container,
  view: AgentConversationView | undefined,
  theme: Theme,
): void {
  if (!view) {
    container.addChild(new Text(theme.fg("dim", "Conversation View unavailable."), 1, 0));
    return;
  }
  if (view.omittedEntryCount > 0) {
    container.addChild(
      new Text(
        theme.fg(
          "warning",
          `Retention: ${view.omittedEntryCount} conversation entries and ${view.omittedCharacterCount} characters omitted${view.textTruncated ? " (text bound)" : ""}.`,
        ),
        1,
        0,
      ),
    );
  }
  if (view.entries.length === 0) {
    container.addChild(new Text(theme.fg("dim", "No retained conversation entries yet."), 1, 0));
  }
}

function renderProfileDetails(
  container: Container,
  profile: AgentsOverlayProfile,
  theme: Theme,
): void {
  container.addChild(new Spacer(1));
  container.addChild(
    new Text(
      `Description (${profile.fieldSources?.description ?? "unavailable"}): ${profile.description}`,
      1,
      0,
    ),
  );
  if (profile.unavailable) {
    container.addChild(new Text(theme.fg("error", `Unavailable: ${profile.unavailable}`), 1, 0));
    return;
  }
  container.addChild(new Text(`Strongest source: ${profile.source} — ${profile.directory}`, 1, 0));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Model (${profile.fieldSources?.model ?? "session"}): ${profile.model} · Thinking (${profile.fieldSources?.thinking ?? "session"}): ${profile.thinking}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Timeout (${profile.fieldSources?.timeoutMinutes ?? "default"}): ${profile.timeoutMinutes ?? "none"}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Tools (${profile.fieldSources?.tools ?? "unavailable"}): ${profile.tools?.join(", ") || "none"}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `Prompt (${profile.fieldSources?.systemPrompt ?? "unavailable"}): ${profile.systemPrompt} · Instructions (${profile.fieldSources?.instructionScopes ?? "unavailable"}): ${profile.instructionScopes?.join(", ") || "none"}`,
      ),
      1,
      0,
    ),
  );
}

function addDiagnosticOmission(container: Container, count: number, theme: Theme): void {
  if (count === 0) return;
  container.addChild(
    new Text(
      theme.fg("warning", `${count} additional diagnostics omitted by the overlay limit.`),
      1,
      0,
    ),
  );
}

function statusIcon(status: BatchTaskStatus, theme: Theme): string {
  const icons = {
    starting: ["accent", "○"],
    running: ["accent", "●"],
    stopping: ["warning", "◐"],
    completed: ["success", "✓"],
    failed: ["error", "✗"],
    canceled: ["warning", "×"],
    timeout: ["warning", "⌛"],
  } as const;
  const [color, icon] = icons[status];
  return theme.fg(color, icon);
}

function formatUsage(usage: Usage | undefined): string {
  if (!usage) return "";
  return ` · Usage: ${usage.totalTokens.toLocaleString("en-US")} tokens (${usage.input.toLocaleString("en-US")} in, ${usage.output.toLocaleString("en-US")} out) · $${usage.cost.total.toFixed(4)}`;
}

function visibleWindow<T>(items: readonly T[], selected: number): readonly T[] {
  const start = windowStart(items.length, selected);
  return items.slice(start, start + LIST_WINDOW_SIZE);
}

function windowStart(length: number, selected: number, size = LIST_WINDOW_SIZE): number {
  return Math.min(Math.max(0, length - size), Math.max(0, selected - Math.floor(size / 2)));
}
