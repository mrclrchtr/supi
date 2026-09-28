/** Public API for @mrclrchtr/supi-agent-runtime. */

export type { AgentRunDiagnosticErrorRow } from "./diagnostics.ts";
export {
  createEarlyCancellationDiagnostics,
  createUnobservedAgentRunDiagnostics,
  formatAgentRunDiagnostics,
  getAgentRunDiagnosticErrorRows,
} from "./diagnostics.ts";
export type {
  AgentRunProviderAuthority,
  AgentRunRequestAuth,
} from "./provider-authority.ts";
export { createAgentRunProviderAuthority } from "./provider-authority.ts";
export { startAgentRun, startRegisteredAgentRun } from "./run.ts";
export { AgentRunRegistry } from "./session/agent-run-registry.ts";
export type {
  AgentRunDisplayConversation,
  AgentRunDisplayDetails,
  AgentRunDisplayEntry,
  AgentRunDisplayMetadata,
  AgentRunDisplayResult,
  AgentRunRegistration,
  AgentRunRegistryRun,
  AgentRunRegistrySnapshot,
  AgentRunStopResult,
} from "./session/agent-run-registry-types.ts";
export type {
  AgentRunTranscriptDocument,
  AgentRunTranscriptMetadata,
  AgentRunTranscriptOperation,
  AgentRunTranscriptSource,
  AgentRunTranscriptStatus,
  AgentRunTranscriptStatusSnapshot,
} from "./session/transcript-store.ts";
export { AgentRunTranscriptCapture, AgentRunTranscriptStore } from "./session/transcript-store.ts";
export type {
  AgentRunContinuation,
  AgentRunContinuationContext,
  AgentRunContinuationEvent,
  AgentRunContinuationFailureCode,
  AgentRunContinuationStep,
  AgentRunContinuationTurn,
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
  AgentRunToolRenderer,
  AgentSessionInputs,
  CompletionResolver,
  RegisteredAgentRunHandle,
  SafeAssistantStopReason,
  SessionReadinessCheck,
  StartAgentRunOptions,
  StartRegisteredAgentRunOptions,
} from "./types.ts";
export type { RegisterAgentsCommandOptions } from "./ui/agents-command.ts";
export {
  clearAgentsProfilePages,
  getAgentRunRegistry,
  openAgentsViewer,
  registerAgentsCommand,
} from "./ui/agents-command.ts";
export type {
  AgentsProfileDiagnostic,
  AgentsProfilePageEntry,
  AgentsProfilePages,
  AgentsProfilePagesData,
} from "./ui/agents-overlay-data.ts";
export { combineAgentRunUsage } from "./usage.ts";
