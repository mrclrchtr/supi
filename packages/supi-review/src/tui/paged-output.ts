import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { REVIEW_TOOL_SPECS } from "../tool/tool-specs.ts";
import type { ReviewAuditReference, ReviewOutputReference } from "../types.ts";
import { renderError, renderPartial, renderReviewToolCall } from "./common.ts";

interface TextResult {
  content?: Array<{ type: string; text?: string }>;
  details?: unknown;
}

interface PageDetails extends ReviewOutputReference {
  kind: "review-output-page";
}

interface AuditListDetails {
  kind: "review-audit";
  mode: "list";
  audits: ReviewAuditReference[];
  totalAudits?: number;
  offset?: number;
  nextOffset?: number;
  totalCharacters?: number;
}

interface AuditPageDetails extends ReviewOutputReference {
  kind: "review-audit";
  mode: "outline" | "message" | "raw";
  messageIndex?: number;
}

type AuditDetails = AuditListDetails | AuditPageDetails;

function body(result: TextResult): string {
  const content = result.content?.[0];
  return content?.type === "text" ? (content.text ?? "") : "";
}

function pageSummary(label: string, details: ReviewOutputReference, theme: Theme): string {
  const end = details.nextOffset ?? details.totalCharacters;
  const continuation = details.nextOffset === undefined ? "complete" : "more available";
  return `${theme.fg("accent", label)} ${theme.fg("muted", `${details.offset.toLocaleString("en-US")}–${end.toLocaleString("en-US")} of ${details.totalCharacters.toLocaleString("en-US")} chars`)} ${theme.fg("dim", `· ${continuation}`)}`;
}

function expandedPage(
  label: string,
  details: ReviewOutputReference,
  result: TextResult,
  theme: Theme,
): Container {
  const container = new Container();
  container.addChild(new Text(pageSummary(label, details, theme), 0, 0));
  const text = body(result).trimEnd();
  if (text) {
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("toolOutput", text), 0, 0));
  }
  return container;
}

export function renderOutputCall(args: unknown, theme: Theme): Text {
  const params = (args ?? {}) as { artifactId?: string; offset?: number };
  return renderReviewToolCall(
    REVIEW_TOOL_SPECS.output.name,
    params.artifactId ?? "output",
    theme,
    `offset ${params.offset ?? 0}`,
  );
}

export function renderOutputResult(
  result: TextResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError: boolean } = { isError: false },
): Container | Text {
  if (options.isPartial) return renderPartial("Reading review output…", theme);
  const details = result.details as PageDetails | undefined;
  if (context.isError || details?.kind !== "review-output-page") {
    return renderError(`${REVIEW_TOOL_SPECS.output.name} failed`, theme);
  }
  if (options.expanded) return expandedPage("Review output", details, result, theme);
  return new Text(pageSummary("Review output", details, theme), 0, 0);
}

export function renderAuditCall(args: unknown, theme: Theme): Text {
  const params = (args ?? {}) as {
    artifactId?: string;
    view?: "outline" | "message" | "raw";
    messageIndex?: number;
    offset?: number;
  };
  const view = params.artifactId ? (params.view ?? "outline") : "list";
  const detail = params.artifactId
    ? `${view}${view === "message" ? ` ${params.messageIndex ?? "?"}` : ""} · offset ${params.offset ?? 0}`
    : undefined;
  return renderReviewToolCall(
    REVIEW_TOOL_SPECS.audit.name,
    params.artifactId ?? "list",
    theme,
    detail,
  );
}

function renderAuditList(
  details: AuditListDetails,
  expanded: boolean,
  theme: Theme,
): Container | Text {
  const totalAudits = details.totalAudits ?? details.audits.length;
  const summary = theme.fg(
    totalAudits === 0 ? "dim" : "accent",
    `${totalAudits} local reviewer replay${totalAudits === 1 ? "" : "s"}`,
  );
  if (!expanded || details.audits.length === 0) return new Text(summary, 0, 0);

  const container = new Container();
  container.addChild(new Text(summary, 0, 0));
  container.addChild(new Spacer(1));
  for (const audit of details.audits) {
    container.addChild(
      new Text(
        `${theme.fg("accent", audit.artifactId)} ${theme.fg("dim", `expires ${audit.expiresAt}`)}`,
        0,
        0,
      ),
    );
  }
  return container;
}

export function renderAuditResult(
  result: TextResult,
  options: { expanded: boolean; isPartial: boolean },
  theme: Theme,
  context: { isError: boolean } = { isError: false },
): Container | Text {
  if (options.isPartial) return renderPartial("Reading reviewer replays…", theme);
  const details = result.details as AuditDetails | undefined;
  if (context.isError || details?.kind !== "review-audit") {
    return renderError(`${REVIEW_TOOL_SPECS.audit.name} failed`, theme);
  }
  if (details.mode === "list") return renderAuditList(details, options.expanded, theme);
  const label =
    details.mode === "outline"
      ? "Replay Outline"
      : details.mode === "message"
        ? `Replay message ${details.messageIndex ?? "?"}`
        : "Raw reviewer replay";
  if (options.expanded) return expandedPage(label, details, result, theme);
  return new Text(pageSummary(label, details, theme), 0, 0);
}
