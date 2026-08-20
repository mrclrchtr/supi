/** Transcript renderers for the review_audit tool. */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import { renderError, renderPartial, renderReviewToolCall } from "../../tui/common.ts";
import type { ReviewAuditReference, ReviewOutputReference } from "../../types.ts";
import { expandedPage, pageSummary, type TextResult } from "../page-render.ts";
import { REVIEW_AUDIT_TOOL_NAME } from "./spec.ts";

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
  return renderReviewToolCall(REVIEW_AUDIT_TOOL_NAME, params.artifactId ?? "list", theme, detail);
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
) {
  if (options.isPartial) return renderPartial("Reading reviewer replays…", theme);
  const details = result.details as AuditDetails | undefined;
  if (context.isError || details?.kind !== "review-audit") {
    return renderError(`${REVIEW_AUDIT_TOOL_NAME} failed`, theme);
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
