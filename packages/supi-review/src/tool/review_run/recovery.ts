import type {
  AgentRunContinuation,
  AgentRunContinuationContext,
  AgentRunContinuationEvent,
  AgentRunContinuationTurn,
} from "@mrclrchtr/supi-agent-runtime/api";
import { redactDebugData } from "@mrclrchtr/supi-core/debug";
import type { ReviewAuditTraceCollector } from "../../audit/review-audit.ts";
import { REVIEW_LIMITS } from "../../review-limits.ts";
import type {
  ReviewModelSelection,
  ReviewSubmission,
  SubmissionRecovery,
  SubmissionRecoveryAttempt,
} from "../../types.ts";
import type { ReviewRecoveryTerminalState } from "./child-tools.ts";

const RECOVERY_TOOLS = ["submit_review", "decline_review_recovery"] as const;
const RECOVERY_PROMPT = [
  "Inspection is complete.",
  "Use only the retained Reviewer Session history. Do not inspect more Target Evidence.",
  "Call submit_review with the final structured review, or call decline_review_recovery with a reason.",
  "You must call exactly one of these terminal tools.",
].join(" ");

interface ReviewRecoveryPolicyOptions {
  originalModel: ReviewModelSelection;
  recoveryModel?: ReviewModelSelection;
  recoveryModelId?: string;
  submission: { value?: ReviewSubmission };
  terminal: ReviewRecoveryTerminalState;
  trace?: () => ReviewAuditTraceCollector | undefined;
}

/** Finite reviewer-specific policy implemented through the neutral Agent Run continuation seam. */
export class ReviewRecoveryPolicy {
  readonly continuation: AgentRunContinuation;
  readonly #attempts: SubmissionRecoveryAttempt[] = [];

  constructor(private readonly options: ReviewRecoveryPolicyOptions) {
    const secondModelId = options.recoveryModel?.canonicalId ?? options.recoveryModelId;
    const hasDistinctSecondModel =
      secondModelId !== undefined && secondModelId !== options.originalModel.canonicalId;
    this.continuation = {
      maxTurns: hasDistinctSecondModel ? 2 : 1,
      resolveNext: (context) => this.#resolveNext(context),
      onEvent: (event) => this.#observeEvent(event),
      onTurn: (turn) => this.#observeTurn(turn),
    };
  }

  /** Return recovery provenance after the runtime reaches its terminal outcome. */
  result(): SubmissionRecovery | undefined {
    if (this.#attempts.length === 0) return undefined;
    const declineReason = normalizeDeclineReason(this.options.terminal.reason);
    return {
      status:
        this.options.terminal.choice === "submitted" && this.options.submission.value
          ? "succeeded"
          : this.options.terminal.choice === "declined" && declineReason
            ? "declined"
            : "exhausted",
      attempts: this.#attempts.map((attempt) => ({ ...attempt })),
      ...(declineReason ? { declineReason } : {}),
    };
  }

  #resolveNext(context: AgentRunContinuationContext) {
    if (
      this.options.terminal.choice !== undefined ||
      !hasUsableReviewHistory(context.session.messages)
    ) {
      return undefined;
    }
    if (context.nextTurn === 1) {
      return {
        prompt: RECOVERY_PROMPT,
        activeTools: RECOVERY_TOOLS,
        thinkingLevel: "low" as const,
      };
    }
    if (context.nextTurn !== 2) return undefined;
    const requestedModelId =
      this.options.recoveryModel?.canonicalId ?? this.options.recoveryModelId;
    if (!requestedModelId || requestedModelId === this.options.originalModel.canonicalId) {
      return undefined;
    }
    return {
      prompt: RECOVERY_PROMPT,
      activeTools: RECOVERY_TOOLS,
      thinkingLevel: "low" as const,
      model: {
        modelId: requestedModelId,
        ...(this.options.recoveryModel ? { value: this.options.recoveryModel.model } : {}),
      },
    };
  }

  #observeEvent(event: AgentRunContinuationEvent): void {
    const trace = this.options.trace?.();
    if (!trace) return;
    if (event.type === "turn-start") {
      trace.markRecovery({ type: "recovery_turn_start", modelId: event.modelId });
      return;
    }
    if (event.type === "model-switch") {
      trace.markRecovery({
        type: event.success ? "model_switch_succeeded" : "model_switch_failed",
        modelId: event.modelId,
      });
      return;
    }
    trace.markRecovery({
      type: "recovery_turn_end",
      modelId: event.modelId,
      outcome: this.#terminalOutcome(event.outcome),
    });
  }

  #terminalOutcome(
    outcome: AgentRunContinuationTurn["outcome"],
  ): SubmissionRecoveryAttempt["outcome"] {
    if (outcome === "model-switch-failed") return "model-switch-failed";
    if (outcome === "provider-failed") return "provider-failed";
    if (this.options.terminal.choice === "submitted" && this.options.submission.value) {
      return "submitted";
    }
    if (this.options.terminal.choice === "declined" && this.options.terminal.reason) {
      return "declined";
    }
    return "no-terminal-output";
  }

  #observeTurn(turn: AgentRunContinuationTurn): void {
    const outcome = this.#terminalOutcome(turn.outcome);
    this.#attempts.push({
      modelId: turn.modelId,
      outcome,
      ...(turn.usage ? { usage: turn.usage } : {}),
    });
  }
}

/** Retained history is usable when it contains an assistant message or any tool call or result. */
export function hasUsableReviewHistory(messages: readonly unknown[]): boolean {
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as { role?: unknown; content?: unknown };
    if (candidate.role === "assistant" || candidate.role === "toolResult") return true;
    return (
      Array.isArray(candidate.content) &&
      candidate.content.some(
        (block) =>
          block !== null &&
          typeof block === "object" &&
          (block as { type?: unknown }).type === "toolCall",
      )
    );
  });
}

/** Normalize, bound, and redact a parent-facing recovery decline reason. */
export function normalizeDeclineReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  const normalized = [...reason]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return undefined;
  return redactDeclineSecrets(normalized).slice(0, REVIEW_LIMITS.recoveryDeclineReasonCharacters);
}

export function redactDeclineSecrets(value: string): string {
  const marker = "[REDACTED]";
  // biome-ignore lint/security/noSecrets: this is a secret-key-name matcher, not a secret.
  const secretName = "(?:token|password|passwd|secret|api[_-]?key|authorization|credential)";
  const keyed = new RegExp(
    `(\\b[A-Za-z0-9_]*${secretName}[A-Za-z0-9_]*\\b\\s*[:=]\\s*)(?:\\"[^\\"]*\\"|'[^']*'|\\S+)`,
    "gi",
  );
  const json = new RegExp(`(\\"${secretName}\\"\\s*:\\s*)\\"[^\\"]*\\"`, "gi");
  const bearer = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
  return redactDebugData(value)
    .replace(json, (_match, prefix: string) => `${prefix}"${marker}"`)
    .replace(keyed, (_match, prefix: string) => `${prefix}${marker}`)
    .replace(bearer, `Bearer ${marker}`);
}
