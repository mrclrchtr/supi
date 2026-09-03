/** Compact TUI renderers for Antigravity Run calls and results. */
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type {
  AntigravityRunResultDetails,
  ClassifiedSource,
  ClassifiedWorkspaceEvidence,
} from "../../types.ts";
import { ANTIGRAVITY_RUN_TOOL_LABEL } from "./spec.ts";

const MAX_PROMPT_PREVIEW = 120;
const MAX_ERROR_PREVIEW = 500;

/** Render the tool name, safe prompt preview, model, and workspace status. */
export function renderAntigravityCall(args: unknown, theme: Theme, _context?: unknown): Text {
  const params = isRecord(args) ? args : {};
  const prompt = typeof params.prompt === "string" ? safePreview(params.prompt) : undefined;
  const newInput = isRecord(params.new) ? params.new : undefined;
  const model = typeof newInput?.model === "string" ? newInput.model : undefined;
  const workspace = typeof newInput?.workspace === "boolean" ? newInput.workspace : undefined;
  const continuation = isRecord(params.continue);
  const parts = [
    theme.fg("toolTitle", ANTIGRAVITY_RUN_TOOL_LABEL),
    model ? theme.fg("accent", model) : continuation ? theme.fg("accent", "follow-up") : undefined,
    workspace === undefined
      ? undefined
      : theme.fg("dim", workspace ? "workspace" : "Consultation Workspace"),
    prompt ? theme.fg("dim", `· ${prompt}`) : undefined,
  ].filter((part): part is string => part !== undefined);
  return new Text(parts.join(" "), 0, 0);
}

/** Render partial, collapsed, expanded, and error Antigravity states. */
export function renderAntigravityResult(
  result: {
    content?: Array<{ type: string; text?: string }>;
    details?: unknown;
    isError?: boolean;
  },
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError?: boolean } = {},
): Container | Text {
  if (options.isPartial) return renderPartial(result.details, options.expanded, theme);
  if (result.isError || context.isError)
    return renderError(result.content, options.expanded, theme);
  const details = asDetails(result.details);
  if (!details) return new Text(theme.fg("dim", "Antigravity Run finished."), 0, 0);
  return options.expanded
    ? renderExpanded(details, result.content, theme)
    : renderCollapsed(details, theme);
}

function renderPartial(detailsValue: unknown, expanded: boolean, theme: Theme): Text | Container {
  const details = isRecord(detailsValue) ? detailsValue : {};
  const model = typeof details.model === "string" ? details.model : "model pending";
  const workspace = details.workspaceAccess === true ? "workspace" : "Consultation Workspace";
  const activity =
    typeof details.latestActivity === "string" ? safePreview(details.latestActivity) : "preparing";
  const line = theme.fg("warning", `● ${ANTIGRAVITY_RUN_TOOL_LABEL} · ${model} · ${workspace}`);
  if (!expanded) return new Text(`${line}\n${theme.fg("dim", activity)}`, 0, 0);
  const container = new Container();
  container.addChild(new Text(line, 0, 0));
  container.addChild(new Text(theme.fg("dim", `activity: ${activity}`), 1, 0));
  return container;
}

function renderCollapsed(details: AntigravityRunResultDetails, theme: Theme): Text {
  const usage = formatUsage(details.usage);
  const evidence = [
    `${details.observedSources.length} observed source${details.observedSources.length === 1 ? "" : "s"}`,
    `${details.observedWorkspaceEvidence.length} observed path${details.observedWorkspaceEvidence.length === 1 ? "" : "s"}`,
  ];
  if (usage) evidence.push(usage);
  const warning = details.warnings.length > 0 ? ` · ${details.warnings.length} warning(s)` : "";
  return new Text(
    `${theme.fg("success", "✓ Antigravity Run complete")} · ${details.handle} · ${evidence.join(" · ")}${warning}`,
    0,
    0,
  );
}

function renderExpanded(
  details: AntigravityRunResultDetails,
  content: Array<{ type: string; text?: string }> | undefined,
  theme: Theme,
): Container {
  const container = new Container();
  container.addChild(
    new Text(
      theme.fg(
        "accent",
        `${theme.bold("Antigravity Run complete")} · ${details.model} · ${details.workingDirectoryKind}`,
      ),
      0,
      0,
    ),
  );
  container.addChild(new Text(theme.fg("dim", `handle: ${details.handle}`), 1, 0));
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `CLI: ${details.cliVersion} · ${formatUsage(details.usage) || "usage unavailable"}`,
      ),
      1,
      0,
    ),
  );
  container.addChild(
    new Text(
      theme.fg(
        "dim",
        `web: ${details.webUsed ? "used" : "not used"} · workspace: ${details.workspaceUsed ? "used" : "not used"} · project guidance: ${details.ambientProjectGuidanceAvailable ? "available" : "not available"}`,
      ),
      1,
      0,
    ),
  );
  renderSources(container, "Observed sources", details.observedSources, theme);
  renderSources(container, "Claimed sources", details.claimedSources, theme);
  renderWorkspace(container, "Observed workspace paths", details.observedWorkspaceEvidence, theme);
  renderWorkspace(container, "Claimed workspace paths", details.claimedWorkspaceEvidence, theme);
  if (details.warnings.length > 0) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("warning", "Warnings"), 1, 0));
    for (const warning of details.warnings)
      container.addChild(new Text(theme.fg("dim", `- ${warning}`), 1, 0));
  }
  const markdown = content?.find((item) => item.type === "text")?.text;
  if (markdown) {
    container.addChild(new Spacer(1));
    container.addChild(new Markdown(markdown, 1, 0, getMarkdownTheme()));
  }
  return container;
}

function renderSources(
  container: Container,
  title: string,
  sources: readonly ClassifiedSource[],
  theme: Theme,
): void {
  if (sources.length === 0) return;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", title), 1, 0));
  for (const source of sources) {
    container.addChild(
      new Text(theme.fg("dim", `- ${safePreview(source.title)}: ${source.url}`), 2, 0),
    );
  }
}

function renderWorkspace(
  container: Container,
  title: string,
  evidence: readonly ClassifiedWorkspaceEvidence[],
  theme: Theme,
): void {
  if (evidence.length === 0) return;
  container.addChild(new Spacer(1));
  container.addChild(new Text(theme.fg("muted", title), 1, 0));
  for (const item of evidence) {
    container.addChild(
      new Text(theme.fg("dim", `- ${item.path}: ${safePreview(item.summary)}`), 2, 0),
    );
  }
}

function renderError(
  content: Array<{ type: string; text?: string }> | undefined,
  expanded: boolean,
  theme: Theme,
): Text {
  const text = content?.find((item) => item.type === "text")?.text;
  const message = text ? safePreview(text, expanded ? MAX_ERROR_PREVIEW : 160) : "operation failed";
  return new Text(theme.fg("error", `Antigravity Run failed: ${message}`), 0, 0);
}

function asDetails(value: unknown): AntigravityRunResultDetails | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.model !== "string" ||
    typeof value.handle !== "string" ||
    typeof value.cliVersion !== "string" ||
    (value.workingDirectoryKind !== "workspace" && value.workingDirectoryKind !== "consultation") ||
    !Array.isArray(value.observedSources) ||
    !Array.isArray(value.claimedSources) ||
    !Array.isArray(value.observedWorkspaceEvidence) ||
    !Array.isArray(value.claimedWorkspaceEvidence) ||
    !Array.isArray(value.warnings) ||
    !value.observedSources.every(isClassifiedSource) ||
    !value.claimedSources.every(isClassifiedSource) ||
    !value.observedWorkspaceEvidence.every(isClassifiedWorkspaceEvidence) ||
    !value.claimedWorkspaceEvidence.every(isClassifiedWorkspaceEvidence) ||
    !value.warnings.every((warning) => typeof warning === "string")
  ) {
    return undefined;
  }
  return value as unknown as AntigravityRunResultDetails;
}

function formatUsage(
  usage: { totalTokens?: number; inputTokens?: number; outputTokens?: number } | undefined,
): string {
  if (!usage) return "";
  const total = usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0);
  return `${total.toLocaleString("en-US")} tokens`;
}

function isClassifiedSource(value: unknown): value is ClassifiedSource {
  return (
    isRecord(value) &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    (value.evidence === "observed" || value.evidence === "claimed")
  );
}

function isClassifiedWorkspaceEvidence(value: unknown): value is ClassifiedWorkspaceEvidence {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    typeof value.summary === "string" &&
    (value.evidence === "observed" || value.evidence === "claimed")
  );
}

function safePreview(value: string, maxLength = MAX_PROMPT_PREVIEW): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
