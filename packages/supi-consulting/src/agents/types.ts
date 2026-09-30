import type { ConsultationExecutionFacts, ConsultingAgentId, ConsultingModel } from "../types.ts";

/** Immutable availability returned by one Consulting Agent adapter. */
export interface ConsultingAgentAvailability {
  status: "available";
  agent: ConsultingAgentId;
  agentVersion: string;
  catalogue: readonly ConsultingModel[];
}

/** A bounded reason why a Consulting Agent is not available. */
export interface ConsultingAgentUnavailable {
  status: "unavailable";
  reason: string;
  warning: string;
  agentVersion?: string;
}

/** Result of one session-scoped agent discovery. */
export type ConsultingAvailability = ConsultingAgentAvailability | ConsultingAgentUnavailable;

/** Inputs to one bounded Consultation executed by an agent adapter. */
export interface ConsultingAgentExecutionOptions {
  prompt: string;
  model: ConsultingModel;
  canonicalWorkingDirectory: string;
  workspaceAccess: boolean;
  continuation?: string;
  signal?: AbortSignal;
  onProgress?: (activity: string) => void;
  onWarning?: (warning: string) => void;
  onProcessStart?: () => void;
}

/** Private execution and discovery interface for the supported Consulting Agent. */
export interface ConsultingAgentAdapter {
  readonly identity: ConsultingAgentId;
  /** The agent's stable, package-managed empty Consultation Workspace. */
  readonly consultationWorkspace: string;
  discover(options?: { signal?: AbortSignal }): Promise<ConsultingAvailability>;
  /** Reject with a ConsultingAgentError; raw diagnostics and causes stay inside the adapter. */
  execute(options: ConsultingAgentExecutionOptions): Promise<ConsultationExecutionFacts>;
}
