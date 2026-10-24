import type { Model, ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  AgentSessionEvent,
  ResourceLoader,
  SessionEntry,
  SessionStats,
  SettingsManager,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentRunAuxiliaryModelSnapshot } from "./auxiliary-models.ts";
import type { AgentRunProviderAuthority } from "./provider-authority.ts";
import type { AgentRunRegistry } from "./session/agent-run-registry.ts";
import type { AgentRunRegistration } from "./session/agent-run-registry-types.ts";

/**
 * Agent Run failure stages; `prompt-rejected` means no initial prompt started.
 * `provider-error` requires a provider-reported assistant error, not missing Usage.
 */
export type AgentRunFailureCode =
  | "session-creation-failed"
  | "session-not-ready"
  | "prompt-rejected"
  | "missing-completion"
  | "provider-error"
  | "unexpected-runner-failure";

/** Detached native Pi session entries and their active leaf. */
export interface AgentRunContext {
  readonly entries: readonly SessionEntry[];
  readonly leafId: string | null;
}

/** Task outcome snapshot; the terminal handle outcome additionally includes all session Usage. */
export type AgentRunOutcome<T> = (
  | { kind: "success"; value: T; usage?: Usage }
  | ({ kind: "failed"; usage?: Usage } & (
      | { failureCode: "session-creation-failed"; diagnostics?: never }
      | {
          failureCode: Exclude<AgentRunFailureCode, "session-creation-failed">;
          diagnostics: AgentRunDiagnostics;
        }
    ))
  | { kind: "canceled"; diagnostics: AgentRunDiagnostics; usage?: Usage }
  | { kind: "timeout"; timeoutMs: number; diagnostics: AgentRunDiagnostics; usage?: Usage }
) & { context?: AgentRunContext };

/** Caller-owned resources and policy used to create an Agent Run session. */
export interface AgentSessionInputs {
  /** Working directory used for tools and resource discovery. */
  cwd: string;
  /** Effective model selected by the caller. */
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  model: Model<any>;
  /** Additional models that a finite continuation can select in this Agent Run. */
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  readonly authorizedContinuationModels?: readonly Model<any>[];
  /** Caller-owned provider and credential authority borrowed for this run. */
  providerAuthority: AgentRunProviderAuthority;
  /** Optional frozen classifier/image allowlist captured for this invocation. */
  readonly authorizedAuxiliaryModels?: AgentRunAuxiliaryModelSnapshot;
  /** Effective thinking level, normally clamped by the caller. */
  thinkingLevel: ModelThinkingLevel;
  /** Complete built-in and custom-tool allowlist for the run. */
  readonly tools: readonly string[];
  /** Optional active subset used for the initial prompt. Defaults to the complete allowlist. */
  readonly initialActiveTools?: readonly string[];
  /** Caller-owned custom tool definitions. */
  readonly customTools?: readonly ToolDefinition[];
  /** Explicit resource policy for this run. */
  resourceLoader: ResourceLoader;
  /** Explicit settings policy for this run. */
  settingsManager: SettingsManager;
  /** Optional PI agent directory; defaults to PI's configured directory. */
  agentDir?: string;
  /** Optional native Pi conversation history to restore for this run. */
  readonly context?: AgentRunContext;
}

/** Read-only message shape exposed to caller-owned completion and observer callbacks. */
export interface AgentRunMessage {
  readonly role: string;
  readonly content?: unknown;
  readonly usage?: Usage;
  readonly [key: string]: unknown;
}

/** Render-only tool details from an owned AgentSession. */
export type AgentRunToolRenderer = Pick<
  ToolDefinition,
  "name" | "renderCall" | "renderResult" | "renderShell"
>;

/** Read-only view of the owned session exposed to caller-owned callbacks. */
export interface AgentRunSessionView {
  readonly cwd: string;
  /** Effective child system prompt. */
  readonly systemPrompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  readonly model: Readonly<Model<any>> | undefined;
  readonly thinkingLevel: ModelThinkingLevel;
  readonly isStreaming: boolean;
  readonly messages: readonly AgentRunMessage[];
  /** Return a defensive copy of the current active tool names. */
  getActiveToolNames(): readonly string[];
  /** Return tool renderers without exposing tool execution functions. */
  getToolRenderers(): readonly AgentRunToolRenderer[];
  /** Return PI's current aggregate session statistics. */
  getSessionStats(): SessionStats;
  /** Return the last visible assistant text, when PI has one. */
  getLastAssistantText(): string | undefined;
  /** Observe session events; the runtime still owns the session lifecycle. */
  subscribe(listener: (event: AgentSessionEvent) => void): () => void;
}

/** Caller-owned function that derives required domain completion from a settled view. */
export type CompletionResolver<T> = (
  session: AgentRunSessionView,
) => T | undefined | Promise<T | undefined>;

/** Caller-owned post-bind, pre-prompt capability check. */
export type SessionReadinessCheck = (
  session: AgentRunSessionView,
) => boolean | undefined | Promise<boolean | undefined>;

/** Caller-owned evidence hook. Its disposer runs before normal disposal; forced teardown may run it later. */
export type AgentRunObserver = (
  session: AgentRunSessionView,
) => undefined | (() => void) | Promise<undefined | (() => void)>;

/** Failure that a finite continuation can handle after the accepted initial prompt settles. */
export type AgentRunContinuationFailureCode = "missing-completion" | "unexpected-runner-failure";

/** One declarative same-session continuation step selected by the caller. */
export interface AgentRunContinuationStep {
  /** Prompt sent from retained session history. */
  prompt: string;
  /** Complete active-tool replacement for this turn. */
  readonly activeTools: readonly string[];
  /** Thinking level applied before this turn. */
  thinkingLevel: ModelThinkingLevel;
  /** Optional requested model switch. Omission keeps the current model. */
  readonly model?: {
    /** Canonical requested model id retained when model resolution failed. */
    readonly modelId: string;
    /** Resolved model. Omission makes the model switch fail closed. */
    // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
    readonly value?: Model<any>;
  };
}

/** Result of one runtime-owned continuation step. */
export interface AgentRunContinuationTurn {
  readonly turn: number;
  readonly modelId: string;
  readonly outcome: "settled" | "provider-failed" | "model-switch-failed";
  readonly promptAccepted: boolean;
  readonly usage?: Usage;
}

/** Read-only context used to select the next finite continuation step. */
export interface AgentRunContinuationContext {
  readonly session: AgentRunSessionView;
  readonly initialFailureCode: AgentRunContinuationFailureCode;
  readonly nextTurn: number;
  readonly previousTurn?: AgentRunContinuationTurn;
}

/** Bounded host observation emitted while the runtime performs continuation mechanics. */
export type AgentRunContinuationEvent =
  | { type: "turn-start"; turn: number; modelId: string }
  | { type: "model-switch"; turn: number; modelId: string; success: boolean }
  | {
      type: "turn-end";
      turn: number;
      modelId: string;
      outcome: AgentRunContinuationTurn["outcome"];
    };

/** Caller-owned finite continuation policy. The runtime executes every selected step. */
export interface AgentRunContinuation {
  /** Hard upper bound for continuation turns. */
  maxTurns: number;
  /** Select the next declarative step, or stop the continuation. */
  resolveNext(
    context: AgentRunContinuationContext,
  ): AgentRunContinuationStep | undefined | Promise<AgentRunContinuationStep | undefined>;
  /** Optional bounded evidence observer for continuation mechanics. */
  onEvent?: (event: AgentRunContinuationEvent) => void;
  /** Optional per-turn observer for domain result mapping and usage provenance. */
  onTurn?: (turn: AgentRunContinuationTurn) => void;
}

/** Result of the optional, tool-free assessment phase; never changes task completion. */
export interface AgentRunRetrospectiveResult {
  readonly status: "completed" | "failed";
  readonly text?: string;
  /** Newly billed retrospective Usage, excluding the completed task. */
  readonly usage?: Usage;
}

/** Caller-owned assessment prompt and evidence policy. */
export interface AgentRunRetrospective {
  readonly prompt: string;
  /** Recheck opt-in and logging availability immediately before the assessment. */
  readonly isEnabled?: () => boolean;
  /** Synchronous evidence sink; failures cannot invalidate the task result. */
  readonly onResult: (result: AgentRunRetrospectiveResult) => void;
}

/** Non-terminal and terminal status exposed through progress snapshots. */
export type AgentRunStatus =
  | "starting"
  | "running"
  | "retrospecting"
  | "stopping"
  | "completed"
  | "failed"
  | "canceled"
  | "timeout";

/** Immutable-by-convention progress snapshot for one Agent Run. */
export interface AgentRunProgress {
  readonly status: AgentRunStatus;
  readonly turns: number;
  readonly toolUses: number;
  /** Tool executions that returned an error. */
  readonly toolErrors: number;
  readonly usage?: Usage;
}

/** Allowlisted lifecycle trace retained for normal diagnostics. */
export interface AgentRunLifecycleTrace {
  readonly entries: readonly AgentRunLifecycleTraceEntry[];
  readonly droppedCount: number;
}

/** Safe assistant stop reasons retained in normal diagnostics. */
export type SafeAssistantStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

/** Bounded, redacted diagnostics retained on non-success outcomes. */
export interface AgentRunDiagnostics {
  readonly lifecycleTrace: AgentRunLifecycleTrace;
  readonly turns: number;
  readonly toolUses: number;
  readonly tokens?: {
    readonly input: number;
    readonly output: number;
    readonly total: number;
    readonly cacheRead?: number;
    readonly cacheWrite?: number;
  };
  readonly recentActivity?: readonly string[];
  readonly lastAssistantStopReason?: SafeAssistantStopReason;
  readonly lastAssistantToolCalls?: readonly string[];
  readonly lastAssistantToolCallsDropped?: number;
  readonly lastAssistantErrorText?: string;
  readonly lastLifecycleErrorText?: string;
}

/** Safe lifecycle event metadata retained in the bounded diagnostic tail. */
export type AgentRunLifecycleTraceEntry =
  | { type: "agent_start" }
  | { type: "agent_end"; willRetry: boolean }
  | { type: "agent_settled" }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | {
      type: "compaction_end";
      reason: "manual" | "threshold" | "overflow";
      aborted: boolean;
      willRetry: boolean;
      hasResult: boolean;
      hasError: boolean;
      errorText?: string;
    }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number; delayMs: number }
  | {
      type: "auto_retry_end";
      success: boolean;
      attempt: number;
      hasFinalError: boolean;
      finalErrorText?: string;
    }
  | {
      type: "summarization_retry_scheduled";
      attempt: number;
      maxAttempts: number;
      delayMs: number;
    }
  | {
      type: "summarization_retry_attempt_start";
      source: "branchSummary" | "compaction";
      reason?: "manual" | "threshold" | "overflow";
    }
  | { type: "summarization_retry_finished" }
  | { type: "queue_update"; steeringCount: number; followUpCount: number }
  | { type: "timeout_expired" }
  | { type: "abort_requested"; reason: "canceled" | "timeout" }
  | {
      type: "prompt_rejected";
      reason: "handled" | "queued" | "threw-before-start" | "resolved-without-disposition";
    };

/** Pi's input disposition for an active steering request, or a closed/unavailable run. */
export type AgentRunSteerResult = Awaited<ReturnType<AgentSession["steer"]>> | "not-running";

/** Listener used by the Agent Run Handle progress subscription. */
export type AgentRunProgressListener = (progress: AgentRunProgress) => void;

/** Options accepted by `startAgentRun`. */
export interface StartAgentRunOptions<T> {
  /** Caller-owned session inputs and resource policy. */
  inputs: AgentSessionInputs;
  /** Initial user prompt sent after readiness succeeds. */
  prompt: string;
  /** Caller-owned completion derivation. */
  completionResolver: CompletionResolver<T>;
  /** Optional caller-owned readiness check. */
  readinessCheck?: SessionReadinessCheck;
  /** Optional caller-owned evidence observer. */
  observer?: AgentRunObserver;
  /** Optional bounded same-session continuation after an accepted recoverable failure. */
  continuation?: AgentRunContinuation;
  /** Optional post-result assessment; the runtime retains lifecycle ownership. */
  retrospective?: AgentRunRetrospective;
  /** Optional task timeout, measured before prompting and cleared at result readiness. */
  timeoutMs?: number;
  /** Optional containing-session cancellation signal. */
  signal?: AbortSignal;
  /** Capture finalized native Pi context in the terminal outcome. Defaults to false. */
  captureContext?: boolean;
}

/** Sole public control interface for one Agent Run. */
export interface AgentRunHandle<T> {
  /** True only while the initial user prompt accepts steering. */
  readonly steeringAvailable: boolean;
  /** Frozen task outcome and task-only Usage, available before an optional retrospective. */
  readonly taskResult: Promise<AgentRunOutcome<T>>;
  /** Terminal outcome, including all usage attributable to the owned Agent Run session. */
  readonly result: Promise<AgentRunOutcome<T>>;
  /** Subscribe to immutable progress snapshots; the current snapshot is immediate. */
  subscribe(listener: AgentRunProgressListener): () => void;
  /** Queue a steering message only while the run is actively prompting. */
  steer(message: string): Promise<AgentRunSteerResult>;
  /** Stop the run; repeated calls share the same terminal cleanup. */
  stop(): Promise<void>;
}

/** Options for `startRegisteredAgentRun()`. */
export interface StartRegisteredAgentRunOptions<T> extends StartAgentRunOptions<T> {
  /** Optional containing-session registry. */
  readonly registry?: AgentRunRegistry;
  /** Viewer metadata and caller-owned conversation/activity views. */
  readonly registration: Pick<
    AgentRunRegistration,
    "metadata" | "getConversation" | "getRecentActivity"
  >;
  /** System prompt to store before the child session starts. */
  readonly transcriptSystemPrompt?: string;
}

/** Handle returned by `startRegisteredAgentRun()`, with its stable run key. */
export interface RegisteredAgentRunHandle<T> extends AgentRunHandle<T> {
  readonly runKey: string;
}
