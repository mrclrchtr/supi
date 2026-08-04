/**
 * Package-root re-export surface for @mrclrchtr/supi-agent-runtime.
 *
 * Prefer importing from `@mrclrchtr/supi-agent-runtime/api` for the explicit
 * public library surface.
 */

export type {
  AgentRunDiagnosticErrorRow,
  AgentRunDiagnostics,
  AgentRunFailureCode,
  AgentRunHandle,
  AgentRunLifecycleTrace,
  AgentRunLifecycleTraceEntry,
  AgentRunMessage,
  AgentRunObserver,
  AgentRunOutcome,
  AgentRunProgress,
  AgentRunProgressListener,
  AgentRunSessionView,
  AgentRunStatus,
  AgentRunSteerResult,
  AgentSessionInputs,
  BuildAgentRunDiagnosticsInput,
  CompletionResolver,
  SafeAssistantStopReason,
  SessionReadinessCheck,
  StartAgentRunOptions,
} from "./api.ts";
export {
  AGENT_RUN_ABORT_GRACE_MS,
  AGENT_RUN_ASSISTANT_TOOL_CALLS_MAX,
  AGENT_RUN_DIAGNOSTIC_NAME_MAX,
  AGENT_RUN_LIFECYCLE_TRACE_MAX,
  AGENT_RUN_RECENT_ACTIVITY_MAX,
  AGENT_RUN_SHUTDOWN_GRACE_MS,
  AgentRunLifecycleTraceCollector,
  addAgentRunUsage,
  buildAgentRunDiagnostics,
  collectAgentRunUsage,
  combineAgentRunUsage,
  createEarlyCancellationDiagnostics,
  createUnobservedAgentRunDiagnostics,
  extractLastLifecycleErrorText,
  formatAgentRunDiagnostics,
  formatAgentRunLifecycleTrace,
  getAgentRunDiagnosticErrorRows,
  getRegisteredToolNames,
  MAX_AGENT_RUN_ERROR_CHARACTERS,
  sanitizeAgentRunErrorText,
  startAgentRun,
  toSafeAssistantStopReason,
} from "./api.ts";
