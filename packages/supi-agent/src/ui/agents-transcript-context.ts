import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptOperation,
} from "../tool/agent_run/transcript-store.ts";
import { formatTranscriptValue } from "./agents-transcript-payload.ts";

/** Render Agent Run metadata for the transcript. */
export function renderTranscriptMetadata(
  document: AgentRunTranscriptDocument,
  theme: Theme,
): Container {
  const { metadata } = document;
  const container = new Container();
  const statusColor = document.status === "complete" ? "success" : "warning";
  container.addChild(
    new Text(
      theme.fg("accent", theme.bold(`${metadata.taskId} · ${metadata.profileId}`)) +
        theme.fg(statusColor, ` · capture ${document.status} · ${document.messageCount} messages`),
      0,
      0,
    ),
  );
  const fields = [
    `Batch: ${metadata.batchId}`,
    `Model: ${metadata.modelId} · thinking ${metadata.thinkingLevel}`,
    `Working directory: ${metadata.cwd}`,
    `Tools: ${metadata.tools.join(", ") || "none"}`,
    `Started: ${new Date(metadata.startedAt).toLocaleString()}`,
    `Instructions: ${metadata.instructions}`,
    ...(metadata.sharedContext ? [`Shared context: ${metadata.sharedContext}`] : []),
  ];
  for (const field of fields) container.addChild(new Text(field, 0, 0));
  if (document.status === "incomplete") {
    container.addChild(
      new Text(
        theme.fg(
          "warning",
          "Transcript capture is incomplete. The Agent Run continued after a storage failure.",
        ),
        0,
        0,
      ),
    );
  }
  return container;
}

/** Render each effective system prompt in the transcript. */
export function renderSystemPrompt(
  prompt: { readonly occurredAt: number; readonly text: string },
  theme: Theme,
): Container {
  const container = new Container();
  const date = new Date(prompt.occurredAt).toLocaleTimeString();
  container.addChild(new Text(theme.fg("accent", `Effective system prompt · ${date}`), 0, 0));
  container.addChild(new Text(prompt.text || "(empty system prompt)", 1, 0));
  return container;
}

/** Render safe Agent Run events, including compaction summaries and usage. */
export function renderTranscriptOperations(
  operations: readonly AgentRunTranscriptOperation[],
  theme: Theme,
): Container {
  const container = new Container();
  container.addChild(new Text(theme.fg("accent", theme.bold("Run events")), 0, 0));
  for (const operation of operations) appendOperation(container, operation, theme);
  return container;
}

function appendOperation(
  container: Container,
  operation: AgentRunTranscriptOperation,
  theme: Theme,
): void {
  const { type, occurredAt, ...details } = operation;
  const simpleDetails = Object.entries(details).filter(([key, value]) => {
    const isStructured = key === "summary" || key === "usage" || key === "details";
    return !isStructured && value !== undefined && (value === null || typeof value !== "object");
  });
  const suffix = simpleDetails.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
  const time = new Date(occurredAt).toLocaleTimeString();
  container.addChild(new Text(`${time} · ${type}${suffix ? ` · ${suffix}` : ""}`, 1, 0));
  if (typeof details.summary === "string") {
    container.addChild(new Text(theme.fg("accent", "Summary"), 1, 0));
    container.addChild(new Text(details.summary, 2, 0));
  }
  for (const key of ["usage", "details"] as const) {
    const value = details[key];
    if (value === undefined) continue;
    container.addChild(new Text(theme.fg("dim", `${key}:`), 1, 0));
    container.addChild(new Text(formatTranscriptValue(value), 2, 0));
  }
}
