import type { Theme } from "@earendil-works/pi-coding-agent";
import {
  Text,
  type TuiMouseEvent,
  type TuiMouseEventResult,
  truncateToWidth,
} from "@earendil-works/pi-tui";
import type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptSource,
} from "../session/transcript-store.ts";
import type { AgentsOverlayRun } from "./agents-overlay-data.ts";
import { type AgentRunBlock, AgentRunViewport } from "./agents-run-viewport.ts";
import {
  type AgentTranscriptInteractiveTarget,
  type AgentTranscriptRenderResult,
  layoutAgentRunTranscript,
  renderAgentRunTranscript,
} from "./agents-transcript.ts";

type TranscriptView = "conversation" | "details";

/** The transcript viewport and loader for one selected Agent Run. */
export class AgentsTranscriptPane {
  #conversationViewport = new AgentRunViewport();
  #detailsViewport = new AgentRunViewport();
  #detailsStarted = false;
  #source: AgentRunTranscriptSource | undefined;
  #document: AgentRunTranscriptDocument | undefined;
  #revision = -1;
  #status: string | undefined;
  #loading = false;
  #failed = false;
  #loadToken = 0;
  #rendered: AgentTranscriptRenderResult | undefined;
  #renderedDocument: AgentRunTranscriptDocument | undefined;
  #renderedView: TranscriptView | undefined;
  #targets: readonly AgentTranscriptInteractiveTarget[] = [];
  #bounds = { top: 0, height: 0, left: 0, width: 0 };
  #toolDetailsExpanded = false;
  #thinkingHidden = false;
  #view: "conversation" | "details" = "conversation";
  #selectedKey: string | undefined;

  get #viewport(): AgentRunViewport {
    return this.#view === "details" ? this.#detailsViewport : this.#conversationViewport;
  }

  constructor(
    private readonly theme: Theme,
    private readonly onChange: () => void,
  ) {}

  get status(): string {
    return this.#viewport.status;
  }

  get scrollOffset(): number {
    return this.#viewport.scrollOffset;
  }

  get isLoading(): boolean {
    return this.#loading;
  }

  get isIncomplete(): boolean {
    return this.#source?.getStatus().status === "incomplete";
  }

  select(run: AgentsOverlayRun | undefined): void {
    if (run?.key !== this.#selectedKey) {
      this.#selectedKey = run?.key;
      this.#conversationViewport.reset();
      this.#detailsViewport.reset();
      this.#detailsStarted = false;
      if (this.#view === "details") {
        this.#detailsViewport.navigate("start");
        this.#detailsStarted = true;
      }
      this.#clearRendered();
      this.#targets = [];
    }
    this.#request(run);
  }

  update(run: AgentsOverlayRun | undefined): void {
    this.#request(run);
  }

  setBounds(bounds: { top: number; height: number; left: number; width: number }): void {
    this.#bounds = bounds;
  }

  render(run: AgentsOverlayRun | undefined, width: number, height: number): string[] {
    if (!run) {
      this.#targets = [];
      return height > 0 ? [this.#line("Select an Agent Run.", width)] : [];
    }
    if (this.#document && run.transcriptSource === this.#source) {
      return this.#renderDocument(run, this.#document, width, height);
    }
    this.#targets = [];
    if (this.#loading) {
      return height > 0 ? [this.#line("Loading the full Agent Run transcript…", width)] : [];
    }
    return this.#renderFallback(run, width, height);
  }

  #renderDocument(
    run: AgentsOverlayRun,
    document: AgentRunTranscriptDocument,
    width: number,
    height: number,
  ): string[] {
    if (
      !this.#rendered ||
      this.#renderedDocument !== document ||
      this.#renderedView !== this.#view
    ) {
      this.#rendered = renderAgentRunTranscript({
        document,
        toolRenderers: this.#source?.toolRenderers ?? [],
        theme: this.theme,
        tui: { requestRender: () => this.onChange() },
        expanded: this.#toolDetailsExpanded,
        thinkingHidden: this.#thinkingHidden,
        view: this.#view,
        previous: this.#rendered,
      });
      this.#renderedDocument = document;
      this.#renderedView = this.#view;
    }
    const rendered = this.#rendered;
    if (!rendered) throw new Error("Transcript render was not created.");
    const layout = layoutAgentRunTranscript(rendered, width);
    const registryMetadata =
      this.#view === "details" ? this.#registryMetadataBlocks(run, width) : [];
    const registryRows = registryMetadata.reduce((count, block) => count + block.lines.length, 0);
    this.#targets = layout.targets.map((target) => ({
      ...target,
      start: target.start + registryRows,
    }));
    const fallback =
      document.status === "incomplete"
        ? this.#fallbackBlocks(run, width, rendered.items.length, {
            warning: "Transcript capture is incomplete. Showing the retained Agent Run view.",
            showTechnicalDetails: this.#view === "details",
          })
        : [];
    return this.#viewport.render([...registryMetadata, ...layout.blocks, ...fallback], height);
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (
      event.type !== "click" ||
      event.button !== "left" ||
      event.y < this.#bounds.top ||
      event.y >= this.#bounds.top + this.#bounds.height ||
      event.x < this.#bounds.left ||
      event.x >= this.#bounds.left + this.#bounds.width
    ) {
      return undefined;
    }
    const transcriptRow = this.#viewport.scrollOffset + event.y - this.#bounds.top;
    const target = this.#targets.find(
      (entry) => transcriptRow >= entry.start && transcriptRow < entry.start + entry.height,
    );
    if (!target) return undefined;
    const result = target.component.handleMouse?.({
      ...event,
      x: event.x - this.#bounds.left,
      y: transcriptRow - target.start,
      width: this.#bounds.width,
      height: target.height,
    });
    if (result?.handled || result?.capture || result?.focus) {
      this.onChange();
      return result;
    }
    return undefined;
  }

  scrollBy(lines: number): void {
    this.#viewport.scrollBy(lines);
  }

  navigate(action: "page-up" | "page-down" | "start" | "end" | "toggle"): void {
    this.#viewport.navigate(action);
  }

  setDetails(details: boolean): void {
    const view = details ? "details" : "conversation";
    if (this.#view === view) return;
    this.#view = view;
    if (details && !this.#detailsStarted) {
      this.#detailsViewport.navigate("start");
      this.#detailsStarted = true;
    }
    this.onChange();
  }

  toggleToolDetails(): void {
    const anyExpanded =
      this.#rendered?.rawPayloads.some((payload) => payload.isExpanded) ??
      this.#toolDetailsExpanded;
    this.#toolDetailsExpanded = !anyExpanded;
    this.#applyToolExpansion();
  }

  toggleThinking(): void {
    this.#thinkingHidden = !this.#thinkingHidden;
    for (const message of this.#rendered?.assistantMessages ?? []) {
      message.setHideThinkingBlock(this.#thinkingHidden);
    }
  }

  invalidate(): void {
    for (const item of this.#rendered?.items ?? []) item.component.invalidate();
  }

  dispose(): void {
    this.#loadToken++;
  }

  #request(run: AgentsOverlayRun | undefined): void {
    const source = run?.transcriptSource;
    if (!source) {
      this.#loadToken++;
      this.#source = undefined;
      this.#document = undefined;
      this.#revision = -1;
      this.#status = undefined;
      this.#loading = false;
      this.#failed = false;
      this.#clearRendered();
      return;
    }
    const status = source.getStatus();
    if (
      source === this.#source &&
      status.revision === this.#revision &&
      status.status === this.#status
    ) {
      return;
    }
    const sameSource = source === this.#source;
    this.#source = source;
    this.#revision = status.revision;
    this.#status = status.status;
    this.#loading = true;
    this.#failed = false;
    if (!sameSource) {
      this.#document = undefined;
      this.#clearRendered();
    }
    const token = ++this.#loadToken;
    const selectedKey = run?.key;
    void source
      .load()
      .then((document) => {
        if (token !== this.#loadToken || this.#selectedKey !== selectedKey) return;
        this.#document = document;
        this.#loading = false;
        this.#failed = document.status === "incomplete" && status.status === "complete";
        this.onChange();
      })
      .catch(() => {
        if (token !== this.#loadToken || this.#selectedKey !== selectedKey) return;
        this.#loading = false;
        this.#failed = true;
        this.#document = undefined;
        this.onChange();
      });
  }

  #applyToolExpansion(): void {
    for (const tool of this.#rendered?.toolCalls ?? []) {
      tool.setExpanded(this.#toolDetailsExpanded);
    }
    for (const raw of this.#rendered?.rawPayloads ?? []) {
      raw.setExpanded(this.#toolDetailsExpanded);
    }
  }

  #clearRendered(): void {
    this.#rendered = undefined;
    this.#renderedDocument = undefined;
    this.#renderedView = undefined;
  }

  #renderFallback(run: AgentsOverlayRun, width: number, height: number): string[] {
    return this.#viewport.render(
      this.#fallbackBlocks(run, width, 0, {
        ...(this.#failed
          ? { warning: "Transcript storage is unavailable. Showing the retained Agent Run view." }
          : {}),
        showTechnicalDetails: this.#view === "details",
      }),
      height,
    );
  }

  #registryMetadataBlocks(run: AgentsOverlayRun, width: number): AgentRunBlock[] {
    if (this.#view !== "details") return [];
    const status = run.result?.failureCode
      ? `${run.status} (${run.result.failureCode})`
      : run.status;
    const details = [
      `Registry status: ${status}`,
      `Runtime totals: ${run.turns} turns · ${run.toolUses} tool uses${
        run.usage ? ` · ${run.usage.totalTokens.toLocaleString("en-US")} tokens` : ""
      }`,
    ];
    return details.map((text, index) => ({
      key: index - details.length,
      lines: new Text(text, 0, 0).render(width),
    }));
  }

  #fallbackBlocks(
    run: AgentsOverlayRun,
    width: number,
    keyOffset: number,
    options: { warning?: string; showTechnicalDetails?: boolean } = {},
  ): AgentRunBlock[] {
    const metadata = options.showTechnicalDetails ? fallbackMetadata(run) : [];
    const blocks = [...(options.warning ? [options.warning] : []), ...metadata].map(
      (line, index) => ({
        key: keyOffset + index,
        lines: new Text(line, 0, 0).render(width),
      }),
    );
    for (const entry of run.conversation?.entries ?? []) {
      const line =
        entry.kind === "assistant" || entry.kind === "steering"
          ? entry.text
          : `${entry.toolName}: ${entry.summary ?? entry.status}`;
      blocks.push({
        key: keyOffset + blocks.length,
        lines: new Text(line, 1, 0).render(width),
      });
    }
    if (blocks.length === 0) {
      blocks.push({
        key: keyOffset,
        lines: new Text("Full transcript is unavailable.", 0, 0).render(width),
      });
    }
    return blocks;
  }

  #line(text: string, width: number): string {
    return truncateToWidth(` ${text}`, width);
  }
}

function fallbackMetadata(run: AgentsOverlayRun): string[] {
  const metadata = [
    `${run.taskId} · ${run.kind}: ${run.label} · ${run.result?.failureCode ? `${run.status} (${run.result.failureCode})` : run.status}`,
    `Model: ${run.modelId} · thinking ${run.thinkingLevel}`,
    `${run.turns} turns · ${run.toolUses} tool uses${run.usage ? ` · ${run.usage.totalTokens.toLocaleString("en-US")} tokens` : ""}`,
    ...(run.result?.humanTruncated ? ["Human output truncated."] : []),
    ...(run.conversation?.omittedEntryCount
      ? [`Retention: ${run.conversation.omittedEntryCount} conversation entries omitted.`]
      : []),
    ...(run.taskDescription ? [`Task: ${run.taskDescription}`] : []),
    ...(run.sharedContext ? [`Shared context: ${run.sharedContext}`] : []),
  ];
  if (run.result?.finalText?.trim()) {
    const bounded = boundFallbackResult(run.result.finalText);
    metadata.push("Result", bounded.text);
    if (bounded.truncated) metadata.push("Result shortened for overlay.");
  }
  metadata.push("Conversation");
  return metadata;
}

function boundFallbackResult(text: string): { text: string; truncated: boolean } {
  const characterBound = text.length > 4_000;
  const safeText = text.slice(0, 4_000).replace(/\r\n?/g, "\n").trimEnd();
  const lines = safeText ? safeText.split("\n") : [];
  return {
    text: lines.slice(0, 8).join("\n"),
    truncated: characterBound || lines.length > 8,
  };
}
