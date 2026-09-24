import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  AssistantMessageComponent,
  getMarkdownTheme,
  type Theme,
  ToolExecutionComponent,
  UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { type Component, Image, Text } from "@earendil-works/pi-tui";
import type { AgentRunMessage, AgentRunToolRenderer } from "@mrclrchtr/supi-agent-runtime/api";
import type { AgentRunTranscriptDocument } from "../tool/agent_run/transcript-store.ts";
import type { AgentRunBlock } from "./agents-run-viewport.ts";
import {
  renderSystemPrompt,
  renderTranscriptMetadata,
  renderTranscriptOperations,
} from "./agents-transcript-context.ts";
import { formatTranscriptValue, RawToolPayload } from "./agents-transcript-payload.ts";

export interface AgentTranscriptInteractiveTarget {
  readonly start: number;
  readonly height: number;
  readonly component: Component;
}

export interface AgentTranscriptRenderItem {
  readonly key: number;
  readonly component: Component;
  readonly interactive: boolean;
}

export interface AgentTranscriptRenderResult {
  readonly items: readonly AgentTranscriptRenderItem[];
  readonly assistantMessages: readonly AssistantMessageComponent[];
  readonly toolCalls: readonly ToolExecutionComponent[];
  readonly rawPayloads: readonly RawToolPayload[];
  readonly assistantByIndex: ReadonlyMap<number, AssistantMessageComponent>;
  readonly toolCallsById: ReadonlyMap<string, ToolExecutionComponent>;
  readonly rawPayloadsById: ReadonlyMap<string, RawToolPayload>;
}

/** Options for one full Agent Run transcript render. */
export interface RenderAgentRunTranscriptOptions {
  readonly document: AgentRunTranscriptDocument;
  readonly toolRenderers: readonly AgentRunToolRenderer[];
  readonly theme: Theme;
  readonly tui: { requestRender: () => void };
  readonly expanded: boolean;
  readonly thinkingHidden: boolean;
  readonly previous?: AgentTranscriptRenderResult;
}

interface TranscriptRenderContext extends RenderAgentRunTranscriptOptions {
  readonly items: AgentTranscriptRenderItem[];
  readonly assistantMessages: AssistantMessageComponent[];
  readonly toolCalls: ToolExecutionComponent[];
  readonly rawPayloads: RawToolPayload[];
  readonly assistantByIndex: Map<number, AssistantMessageComponent>;
  readonly toolCallsById: Map<string, ToolExecutionComponent>;
  readonly rawPayloadsById: Map<string, RawToolPayload>;
  readonly renderers: Map<string, AgentRunToolRenderer>;
  readonly results: Map<string, AgentRunMessage>;
  readonly renderedResults: Set<string>;
  nextKey: number;
  messageIndex: number;
}

/** Render a full human transcript with Pi's message and tool components. */
export function renderAgentRunTranscript(
  options: RenderAgentRunTranscriptOptions,
): AgentTranscriptRenderResult {
  const context = createRenderContext(options);
  addItem(context, renderTranscriptMetadata(options.document, options.theme));
  for (const prompt of options.document.systemPromptHistory) {
    addItem(context, renderSystemPrompt(prompt, options.theme));
  }
  if (options.document.operations.length > 0) {
    addItem(context, renderTranscriptOperations(options.document.operations, options.theme));
  }
  for (const message of options.document.messages) {
    appendMessage(context, message, context.messageIndex++);
  }
  return {
    items: context.items,
    assistantMessages: context.assistantMessages,
    toolCalls: context.toolCalls,
    rawPayloads: context.rawPayloads,
    assistantByIndex: context.assistantByIndex,
    toolCallsById: context.toolCallsById,
    rawPayloadsById: context.rawPayloadsById,
  };
}

export function layoutAgentRunTranscript(
  transcript: AgentTranscriptRenderResult,
  width: number,
): { blocks: readonly AgentRunBlock[]; targets: readonly AgentTranscriptInteractiveTarget[] } {
  const blocks: AgentRunBlock[] = [];
  const targets: AgentTranscriptInteractiveTarget[] = [];
  let nextRow = 0;
  for (const item of transcript.items) {
    const lines = item.component.render(width);
    blocks.push({ key: item.key, lines });
    if (item.interactive && lines.length > 0) {
      targets.push({ start: nextRow, height: lines.length, component: item.component });
    }
    nextRow += lines.length;
  }
  return { blocks, targets };
}

function createRenderContext(options: RenderAgentRunTranscriptOptions): TranscriptRenderContext {
  const results = new Map<string, AgentRunMessage>();
  for (const message of options.document.messages) {
    if (message.role === "toolResult" && typeof message.toolCallId === "string") {
      results.set(message.toolCallId, message);
    }
  }
  return {
    ...options,
    items: [],
    assistantMessages: [],
    toolCalls: [],
    rawPayloads: [],
    assistantByIndex: new Map(),
    toolCallsById: new Map(),
    rawPayloadsById: new Map(),
    renderers: new Map(options.toolRenderers.map((renderer) => [renderer.name, renderer])),
    results,
    renderedResults: new Set(),
    nextKey: 0,
    messageIndex: 0,
  };
}

function appendMessage(
  context: TranscriptRenderContext,
  message: AgentRunMessage,
  messageIndex: number,
): void {
  const timestamp =
    typeof message.timestamp === "number" ? new Date(message.timestamp).toLocaleTimeString() : "";
  addItem(
    context,
    new Text(
      context.theme.fg("accent", `${message.role}${timestamp ? ` · ${timestamp}` : ""}`),
      0,
      0,
    ),
  );
  if (message.role === "assistant") {
    appendAssistantMessage(context, message, messageIndex);
  } else if (message.role === "user") {
    appendUserMessage(context, message);
  } else if (message.role === "toolResult") {
    appendToolResult(context, message);
  } else {
    addItem(context, new Text(formatMessage(message), 1, 0));
  }
}

function appendAssistantMessage(
  context: TranscriptRenderContext,
  message: AgentRunMessage,
  messageIndex: number,
): void {
  if (!Array.isArray(message.content)) {
    addItem(context, new Text(formatMessage(message), 1, 0));
    return;
  }
  const existing = context.previous?.assistantByIndex.get(messageIndex);
  const assistant =
    existing ??
    new AssistantMessageComponent(
      message as unknown as AssistantMessage,
      context.thinkingHidden,
      getMarkdownTheme(),
      "Thinking is hidden · press i to show",
      1,
    );
  if (existing) assistant.updateContent(message as unknown as AssistantMessage, false);
  context.assistantByIndex.set(messageIndex, assistant);
  context.assistantMessages.push(assistant);
  addItem(context, assistant, true);
  for (const part of message.content) {
    if (isToolCall(part)) appendToolCall(context, part);
  }
}

function appendToolCall(
  context: TranscriptRenderContext,
  part: { type: "toolCall"; id: string; name: string; arguments: unknown },
): void {
  const result = context.results.get(part.id);
  if (result) context.renderedResults.add(part.id);
  const existing = context.previous?.toolCallsById.get(part.id);
  const tool =
    existing ??
    createToolComponent({
      name: part.name,
      id: part.id,
      args: part.arguments,
      result,
      renderer: context.renderers.get(part.name),
      tui: context.tui,
      cwd: context.document.metadata.cwd,
      expanded: context.expanded,
    });
  if (existing && result) tool.updateResult(toolResultPayload(result), false);
  context.toolCallsById.set(part.id, tool);
  context.toolCalls.push(tool);
  addItem(context, tool, true);
  const rawKey = `tool:${part.id}`;
  const raw = context.previous?.rawPayloadsById.get(rawKey);
  if (raw) {
    raw.update({ input: part.arguments, result });
    context.rawPayloadsById.set(rawKey, raw);
  } else {
    const payload = new RawToolPayload({ input: part.arguments, result }, context.theme);
    payload.setExpanded(context.expanded);
    context.rawPayloadsById.set(rawKey, payload);
  }
  const activeRaw = context.rawPayloadsById.get(rawKey);
  if (!activeRaw) throw new Error("Raw tool payload was not created.");
  context.rawPayloads.push(activeRaw);
  addItem(context, activeRaw, true);
}

function appendUserMessage(context: TranscriptRenderContext, message: AgentRunMessage): void {
  addItem(context, new UserMessageComponent(textContent(message.content), getMarkdownTheme(), 1));
  for (const image of imageContent(message.content)) {
    addItem(
      context,
      new Image(
        image.data,
        image.mimeType,
        { fallbackColor: (text) => context.theme.fg("muted", text) },
        { maxWidthCells: 80, maxHeightCells: 24 },
      ),
    );
  }
}

function appendToolResult(context: TranscriptRenderContext, message: AgentRunMessage): void {
  if (typeof message.toolCallId !== "string" || context.renderedResults.has(message.toolCallId)) {
    return;
  }
  const name = typeof message.toolName === "string" ? message.toolName : "tool";
  const existing = context.previous?.toolCallsById.get(message.toolCallId);
  const tool =
    existing ??
    createToolComponent({
      name,
      id: message.toolCallId,
      result: message,
      renderer: context.renderers.get(name),
      tui: context.tui,
      cwd: context.document.metadata.cwd,
      expanded: context.expanded,
    });
  if (existing) tool.updateResult(toolResultPayload(message), false);
  context.toolCallsById.set(message.toolCallId, tool);
  context.toolCalls.push(tool);
  addItem(context, tool, true);
  const rawKey = `result:${message.toolCallId}`;
  const raw = context.previous?.rawPayloadsById.get(rawKey);
  if (raw) {
    raw.update({ result: message });
    context.rawPayloadsById.set(rawKey, raw);
  } else {
    const payload = new RawToolPayload({ result: message }, context.theme);
    payload.setExpanded(context.expanded);
    context.rawPayloadsById.set(rawKey, payload);
  }
  const activeRaw = context.rawPayloadsById.get(rawKey);
  if (!activeRaw) throw new Error("Raw tool payload was not created.");
  context.rawPayloads.push(activeRaw);
  addItem(context, activeRaw, true);
}

function addItem(
  context: TranscriptRenderContext,
  component: Component,
  interactive = false,
): void {
  context.items.push({ key: context.nextKey++, component, interactive });
}

interface ToolComponentOptions {
  readonly name: string;
  readonly id: string;
  readonly args?: unknown;
  readonly result?: AgentRunMessage;
  readonly renderer?: AgentRunToolRenderer;
  readonly tui: { requestRender: () => void };
  readonly cwd: string;
  readonly expanded: boolean;
}

function toolResultPayload(message: AgentRunMessage): {
  content: never[];
  details: unknown;
  isError: boolean;
} {
  return {
    content: Array.isArray(message.content) ? (message.content as never[]) : [],
    details: message.details,
    isError: message.isError === true,
  };
}

function createToolComponent(options: ToolComponentOptions): ToolExecutionComponent {
  const component = new ToolExecutionComponent(
    options.name,
    options.id,
    options.args,
    { showImages: true },
    options.renderer,
    options.tui as never,
    options.cwd,
  );
  component.setArgsComplete();
  component.markExecutionStarted();
  if (options.result) {
    component.updateResult(toolResultPayload(options.result), false);
  }
  component.setExpanded(options.expanded);
  return component;
}

function isToolCall(
  value: unknown,
): value is { type: "toolCall"; id: string; name: string; arguments: unknown } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "toolCall" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string"
  );
}

function textContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return formatTranscriptValue(content);
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as Record<string, unknown>;
      if (item.type === "text" && typeof item.text === "string") return item.text;
      return item.type === "image" ? "" : formatTranscriptValue(item);
    })
    .filter(Boolean)
    .join("\n");
}

function imageContent(content: unknown): Array<{ data: string; mimeType: string }> {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part) => {
    if (!part || typeof part !== "object") return [];
    const item = part as Record<string, unknown>;
    return item.type === "image" &&
      typeof item.data === "string" &&
      typeof item.mimeType === "string"
      ? [{ data: item.data, mimeType: item.mimeType }]
      : [];
  });
}

function formatMessage(message: AgentRunMessage): string {
  const content = message.content;
  return typeof content === "string" ? content : formatTranscriptValue(message);
}
