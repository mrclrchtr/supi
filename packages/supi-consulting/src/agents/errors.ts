const FAILURE_MESSAGES = {
  unavailable: "The Consulting Agent is unavailable. Reload PI to check availability.",
  timeout: "The Consultation timed out.",
  cancelled: "The Consultation was canceled.",
  "invalid-response": "The Consulting Agent returned an invalid response.",
  "invalid-continuation": "Invalid Conversation Handle continuation state.",
  "conversation-mismatch":
    "The Consulting Agent returned a different conversation for this handle.",
  execution: "Consultation execution failed.",
} as const;

/** Safe failure categories that can leave a private Consulting Agent adapter. */
export type ConsultingAgentFailureKind = keyof typeof FAILURE_MESSAGES;

/**
 * A bounded failure with no agent diagnostics or error cause.
 * Construct messages from fixed categories, never from process output.
 */
export class ConsultingAgentError extends Error {
  readonly kind: ConsultingAgentFailureKind;

  constructor(kind: ConsultingAgentFailureKind) {
    super(FAILURE_MESSAGES[kind]);
    this.name = "ConsultingAgentError";
    this.kind = kind;
  }
}
