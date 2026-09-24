import { randomUUID } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentRunMessage, AgentRunToolRenderer } from "@mrclrchtr/supi-agent-runtime/api";
import type { TranscriptRecord } from "./transcript-format.ts";
import { parseTranscript, projectOperation, sanitizeMessage } from "./transcript-format.ts";

export type AgentRunTranscriptStatus = "capturing" | "complete" | "incomplete";

export interface AgentRunTranscriptMetadata {
  readonly runKey: string;
  readonly batchId: string;
  readonly taskId: string;
  readonly profileId: string;
  readonly cwd: string;
  readonly modelId: string;
  readonly thinkingLevel: string;
  readonly tools: readonly string[];
  readonly instructions: string;
  readonly sharedContext?: string;
  readonly startedAt: number;
}

export interface AgentRunTranscriptOperation {
  readonly type: string;
  readonly occurredAt: number;
  readonly [key: string]: unknown;
}

export interface AgentRunTranscriptDocument {
  readonly metadata: AgentRunTranscriptMetadata;
  readonly systemPrompt: string;
  readonly systemPromptHistory: readonly { readonly occurredAt: number; readonly text: string }[];
  readonly messages: readonly AgentRunMessage[];
  readonly operations: readonly AgentRunTranscriptOperation[];
  readonly status: AgentRunTranscriptStatus;
  readonly messageCount: number;
}

export interface AgentRunTranscriptStatusSnapshot {
  readonly status: AgentRunTranscriptStatus;
  readonly revision: number;
  readonly messageCount: number;
}

/** A temporary, human-only transcript source for one Agent Run. */
export interface AgentRunTranscriptSource {
  readonly runKey: string;
  readonly toolRenderers: readonly AgentRunToolRenderer[];
  getStatus(): AgentRunTranscriptStatusSnapshot;
  load(): Promise<AgentRunTranscriptDocument>;
}

/** Owns all temporary transcript files for one parent session. */
export class AgentRunTranscriptStore {
  #directoryPromise: Promise<string> | undefined;
  #captures = new Set<AgentRunTranscriptCapture>();

  /** Start one temporary transcript capture. A storage error does not fail the Agent Run. */
  createCapture(
    metadata: AgentRunTranscriptMetadata,
    systemPrompt: string,
    toolRenderers: readonly AgentRunToolRenderer[],
    onChange?: () => void,
  ): AgentRunTranscriptCapture {
    const capture = new AgentRunTranscriptCapture({
      metadata,
      systemPrompt,
      toolRenderers,
      getDirectory: () => this.#getDirectory(),
      onChange,
    });
    this.#captures.add(capture);
    return capture;
  }

  /** Remove the session's temporary transcript files. */
  async dispose(): Promise<void> {
    await Promise.all([...this.#captures].map((capture) => capture.finish()));
    const directoryPromise = this.#directoryPromise;
    this.#captures.clear();
    if (!directoryPromise) return;
    const directory = await directoryPromise.catch(() => undefined);
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    this.#directoryPromise = undefined;
  }

  #getDirectory(): Promise<string> {
    this.#directoryPromise ??= mkdtemp(join(tmpdir(), "supi-agent-transcripts-"));
    return this.#directoryPromise;
  }
}

/** Captures finalized session messages and safe lifecycle metadata to one JSONL file. */
export class AgentRunTranscriptCapture implements AgentRunTranscriptSource {
  #status: AgentRunTranscriptStatus = "capturing";
  #revision = 0;
  #messageCount = 0;
  #initialSystemPrompt: string;
  #systemPrompt: string;
  #systemPromptHistory: Array<{ occurredAt: number; text: string }>;
  #toolRenderers: AgentRunToolRenderer[];
  #filePath: string | undefined;
  #writeQueue: Promise<void>;
  readonly metadata: AgentRunTranscriptMetadata;
  private readonly onChange?: () => void;

  constructor(options: {
    metadata: AgentRunTranscriptMetadata;
    systemPrompt: string;
    toolRenderers: readonly AgentRunToolRenderer[];
    getDirectory: () => Promise<string>;
    onChange?: () => void;
  }) {
    const { metadata, systemPrompt, toolRenderers, getDirectory, onChange } = options;
    this.metadata = metadata;
    this.onChange = onChange;
    this.#initialSystemPrompt = systemPrompt;
    this.#systemPrompt = systemPrompt;
    this.#systemPromptHistory = [{ occurredAt: Date.now(), text: systemPrompt }];
    this.#toolRenderers = toolRenderers.map(copyToolRenderer);
    this.#writeQueue = this.#createFile(getDirectory);
  }

  get runKey(): string {
    return this.metadata.runKey;
  }

  get toolRenderers(): readonly AgentRunToolRenderer[] {
    return Object.freeze([...this.#toolRenderers]);
  }

  getStatus(): AgentRunTranscriptStatusSnapshot {
    return Object.freeze({
      status: this.#status,
      revision: this.#revision,
      messageCount: this.#messageCount,
    });
  }

  /** Update the effective prompt and render-only tool definitions. */
  updateSession(systemPrompt: string, toolRenderers: readonly AgentRunToolRenderer[]): void {
    if (this.#status !== "capturing") return;
    this.#updateToolRenderers(toolRenderers);
    if (systemPrompt === this.#systemPrompt) return;
    this.#systemPrompt = systemPrompt;
    const occurredAt = Date.now();
    this.#systemPromptHistory.push({ occurredAt, text: systemPrompt });
    void this.#enqueue({ kind: "system-prompt", text: systemPrompt, occurredAt });
  }

  /** Record finalized messages and allowlisted lifecycle details only. */
  observe(
    event: AgentSessionEvent,
    systemPrompt: string,
    toolRenderers: readonly AgentRunToolRenderer[],
  ): void {
    if (this.#status !== "capturing") return;
    this.updateSession(systemPrompt, toolRenderers);
    if (event.type === "message_end") {
      void this.#enqueue({ kind: "message", message: sanitizeMessage(event.message) });
    }
    const operation = projectOperation(event);
    if (operation) void this.#enqueue({ kind: "operation", operation });
  }

  /** Mark the capture complete after the run settles. */
  async finish(): Promise<void> {
    if (this.#status !== "capturing") return;
    await this.#enqueue({ kind: "status", status: "complete" });
    await this.#writeQueue;
    if (this.#status === "capturing") {
      this.#status = "complete";
      this.#revision++;
      this.onChange?.();
    }
  }

  /** Read the full transcript from temporary storage. */
  load(): Promise<AgentRunTranscriptDocument> {
    const read = this.#writeQueue.then(async () => {
      const filePath = this.#filePath;
      if (!filePath) return this.#document([], [], "incomplete");
      try {
        const content = await readFile(filePath, "utf8");
        const document = parseTranscript(content, this.#document([], [], this.#status));
        if (document.status === "incomplete") this.#markIncomplete();
        return document;
      } catch {
        this.#markIncomplete();
        return this.#document([], [], "incomplete");
      }
    });
    this.#writeQueue = read.then(
      () => undefined,
      () => this.#markIncomplete(),
    );
    return read;
  }

  async #createFile(getDirectory: () => Promise<string>): Promise<void> {
    try {
      const directory = await getDirectory();
      this.#filePath = join(directory, `${randomUUID()}.jsonl`);
      await appendFile(
        this.#filePath,
        `${JSON.stringify({
          kind: "header",
          metadata: this.metadata,
          systemPrompt: this.#initialSystemPrompt,
          occurredAt: this.#systemPromptHistory[0]?.occurredAt ?? Date.now(),
        })}\n`,
        "utf8",
      );
      this.#revision++;
    } catch {
      this.#markIncomplete();
    }
  }

  #enqueue(record: TranscriptRecord): Promise<void> {
    this.#revision++;
    this.#writeQueue = this.#writeQueue
      .then(async () => {
        if (this.#status === "incomplete" || !this.#filePath) return;
        await appendFile(this.#filePath, `${JSON.stringify(record)}\n`, "utf8");
        if (record.kind === "message") this.#messageCount++;
        this.onChange?.();
      })
      .catch(() => this.#markIncomplete());
    return this.#writeQueue;
  }

  #updateToolRenderers(toolRenderers: readonly AgentRunToolRenderer[]): void {
    for (const value of toolRenderers) {
      const renderer = copyToolRenderer(value);
      const index = this.#toolRenderers.findIndex((entry) => entry.name === renderer.name);
      if (index < 0) this.#toolRenderers.push(renderer);
      else this.#toolRenderers[index] = renderer;
    }
  }

  #markIncomplete(): void {
    if (this.#status === "incomplete") return;
    this.#status = "incomplete";
    this.#revision++;
    this.onChange?.();
  }

  #document(
    messages: readonly AgentRunMessage[],
    operations: readonly AgentRunTranscriptOperation[],
    status: AgentRunTranscriptStatus,
    systemPromptHistory: readonly { readonly occurredAt: number; readonly text: string }[] = this
      .#systemPromptHistory,
  ): AgentRunTranscriptDocument {
    return {
      metadata: this.metadata,
      systemPrompt: this.#systemPrompt,
      systemPromptHistory,
      messages,
      operations,
      status,
      messageCount: messages.length,
    };
  }
}

function copyToolRenderer(renderer: AgentRunToolRenderer): AgentRunToolRenderer {
  return Object.freeze({
    name: renderer.name,
    ...(renderer.renderCall ? { renderCall: renderer.renderCall } : {}),
    ...(renderer.renderResult ? { renderResult: renderer.renderResult } : {}),
    ...(renderer.renderShell ? { renderShell: renderer.renderShell } : {}),
  });
}
