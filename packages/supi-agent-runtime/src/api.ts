/** Public API for @mrclrchtr/supi-agent-runtime. */

export {
  MAX_AGENT_RUN_ERROR_CHARACTERS,
  sanitizeAgentRunErrorText,
} from "./diagnostic-sanitizer.ts";
export type {
  AgentRunDiagnosticErrorRow,
  BuildAgentRunDiagnosticsInput,
} from "./diagnostics.ts";
export {
  AGENT_RUN_ASSISTANT_TOOL_CALLS_MAX,
  buildAgentRunDiagnostics,
  createEarlyCancellationDiagnostics,
  createUnobservedAgentRunDiagnostics,
  formatAgentRunDiagnostics,
  getAgentRunDiagnosticErrorRows,
} from "./diagnostics.ts";
export {
  AGENT_RUN_DIAGNOSTIC_NAME_MAX,
  AGENT_RUN_LIFECYCLE_TRACE_MAX,
  AGENT_RUN_RECENT_ACTIVITY_MAX,
  AgentRunLifecycleTraceCollector,
  extractLastLifecycleErrorText,
  formatAgentRunLifecycleTrace,
  getRegisteredToolNames,
  toSafeAssistantStopReason,
} from "./lifecycle-trace.ts";
export {
  AGENT_RUN_ABORT_GRACE_MS,
  AGENT_RUN_SHUTDOWN_GRACE_MS,
  startAgentRun,
} from "./run.ts";
export type {
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
  CompletionResolver,
  SafeAssistantStopReason,
  SessionReadinessCheck,
  StartAgentRunOptions,
} from "./types.ts";
export { addAgentRunUsage, collectAgentRunUsage, combineAgentRunUsage } from "./usage.ts";
