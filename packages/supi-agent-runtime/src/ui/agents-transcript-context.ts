import type { Theme } from "@earendil-works/pi-coding-agent";
import { Container, Text } from "@earendil-works/pi-tui";
import type { AgentRunTranscriptDocument } from "../session/transcript-store.ts";

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
      theme.fg("accent", theme.bold(`${metadata.taskId} · ${metadata.kind}: ${metadata.label}`)) +
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
    ...(metadata.taskDescription ? [`Task: ${metadata.taskDescription}`] : []),
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
