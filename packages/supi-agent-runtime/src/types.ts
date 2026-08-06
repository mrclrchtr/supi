import type { Model, ModelThinkingLevel, Usage } from "@earendil-works/pi-ai";
import type {
  AgentSessionEvent,
  ResourceLoader,
  SessionStats,
  SettingsManager,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import type { AgentRunProviderAuthority } from "./provider-authority.ts";

/** The host-owned failure stages of one Agent Run. */
export type AgentRunFailureCode =
  | "session-creation-failed"
  | "session-not-ready"
  | "prompt-rejected"
  | "missing-completion"
  | "unexpected-runner-failure";

/** Terminal outcome of one managed Agent Run. */
export type AgentRunOutcome<T> =
  | { kind: "success"; value: T; usage?: Usage }
  | ({ kind: "failed"; usage?: Usage } & (
      | { failureCode: "session-creation-failed"; diagnostics?: never }
      | {
          failureCode: Exclude<AgentRunFailureCode, "session-creation-failed">;
          diagnostics: AgentRunDiagnostics;
        }
    ))
  | { kind: "canceled"; diagnostics: AgentRunDiagnostics; usage?: Usage }
  | { kind: "timeout"; timeoutMs: number; diagnostics: AgentRunDiagnostics; usage?: Usage };

/** Caller-owned resources and policy used to create an Agent Run session. */
export interface AgentSessionInputs {
  /** Working directory used for tools and resource discovery. */
  cwd: string;
  /** Effective model selected by the caller. */
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  model: Model<any>;
  /** Caller-owned provider and credential authority borrowed for this run. */
  providerAuthority: AgentRunProviderAuthority;
  /** Effective thinking level, normally clamped by the caller. */
  thinkingLevel: ModelThinkingLevel;
  /** Complete built-in and custom-tool allowlist for the run. */
  readonly tools: readonly string[];
  /** Caller-owned custom tool definitions. */
  readonly customTools?: readonly ToolDefinition[];
  /** Explicit resource policy for this run. */
  resourceLoader: ResourceLoader;
  /** Explicit settings policy for this run. */
  settingsManager: SettingsManager;
  /** Optional PI agent directory; defaults to PI's configured directory. */
  agentDir?: string;
}

/** Read-only message shape exposed to caller-owned completion and observer callbacks. */
export interface AgentRunMessage {
  readonly role: string;
  readonly content?: unknown;
  readonly usage?: Usage;
  readonly [key: string]: unknown;
}

/** Read-only view of the owned session exposed to caller-owned callbacks. */
export interface AgentRunSessionView {
  readonly cwd: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is Pi's canonical type
  readonly model: Readonly<Model<any>> | undefined;
  readonly thinkingLevel: ModelThinkingLevel;
  readonly isStreaming: boolean;
  readonly messages: readonly AgentRunMessage[];
  /** Return a defensive copy of the current active tool names. */
  getActiveToolNames(): readonly string[];
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

/** Non-terminal and terminal status exposed through progress snapshots. */
export type AgentRunStatus =
  | "starting"
  | "running"
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
  | { type: "prompt_rejected" };

/** Result returned by an active-only steering request. */
export type AgentRunSteerResult = "accepted" | "not-running";

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
  /** Optional host timeout, measured from immediately before prompting. */
  timeoutMs?: number;
  /** Optional containing-session cancellation signal. */
  signal?: AbortSignal;
}

/** Sole public control interface for one Agent Run. */
export interface AgentRunHandle<T> {
  /** Terminal outcome, including all usage attributable to the owned Agent Run session. */
  readonly result: Promise<AgentRunOutcome<T>>;
  /** Subscribe to immutable progress snapshots; the current snapshot is immediate. */
  subscribe(listener: AgentRunProgressListener): () => void;
  /** Queue a steering message only while the run is actively prompting. */
  steer(message: string): Promise<AgentRunSteerResult>;
  /** Stop the run; repeated calls share the same terminal cleanup. */
  stop(): Promise<void>;
}
