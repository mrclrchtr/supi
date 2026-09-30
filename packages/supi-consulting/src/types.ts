/** Identity of a supported Consulting Agent. */
export type ConsultingAgentId = string;

/** Agent-specific model identifier retained as a neutral string. */
export type ConsultingModel = string;

/** Caller choice to expose the current PI workspace to a Consultation. */
export type WorkspaceAccess = boolean;

/** An answer source returned by a Consulting Agent. */
export interface ConsultationSource {
  title: string;
  url: string;
}

/** Workspace evidence returned by a Consulting Agent. */
export interface ConsultationWorkspaceEvidence {
  path: string;
  summary: string;
}

/** The structured answer required from a Consulting Agent. */
export interface ConsultationAnswer {
  answer: string;
  sources: ConsultationSource[];
  workspaceEvidence: ConsultationWorkspaceEvidence[];
}

/** Token accounting returned by a Consulting Agent. */
export interface ConsultationUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** A validated source classified by observed execution evidence. */
export interface ClassifiedSource extends ConsultationSource {
  evidence: "observed" | "claimed";
}

/** A validated workspace reference classified by observed execution evidence. */
export interface ClassifiedWorkspaceEvidence extends ConsultationWorkspaceEvidence {
  evidence: "observed" | "claimed";
}

/** Normalized activity categories reported by a Consulting Agent adapter. */
export type ConsultationActivity = "web" | "workspace" | "other";

/** Bounded, protocol-neutral facts from one completed Consultation. */
export interface ConsultationExecutionFacts {
  answer: ConsultationAnswer;
  continuation: string;
  usage?: ConsultationUsage;
  observedActivities: ConsultationActivity[];
  activityCounts: Record<ConsultationActivity, number>;
  webUsed: boolean;
  workspaceUsed: boolean;
  permissionDenials: number;
  observedSourceHashes: string[];
  observedWorkspacePathHashes: string[];
  warnings: string[];
}

/** Branch-aware state retained for one opaque Conversation Handle. */
export interface ConversationHandleRecord {
  handle: string;
  agent: ConsultingAgentId;
  model: ConsultingModel;
  continuation: string;
  canonicalWorkingDirectory: string;
  workspaceAccess: WorkspaceAccess;
  agentVersion: string;
  status: "active" | "retired";
}

/** Structured details retained for one completed Consultation. */
export interface ConsultationResultDetails {
  agent: ConsultingAgentId;
  model: ConsultingModel;
  workingDirectoryKind: "consultation" | "workspace";
  canonicalWorkingDirectory: string;
  workspaceAccess: WorkspaceAccess;
  agentVersion: string;
  durationMs: number;
  usage?: ConsultationUsage;
  observedActivities: ConsultationActivity[];
  activityCounts: Record<ConsultationActivity, number>;
  permissionDenials: number;
  webUsed: boolean;
  workspaceUsed: boolean;
  ambientProjectGuidanceAvailable: boolean;
  activeProjectHookWarning?: string;
  handle: string;
  continuation: string;
  handleState: "active";
  observedSources: ClassifiedSource[];
  claimedSources: ClassifiedSource[];
  observedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  claimedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  warnings: string[];
}

/** Callback for safe, bounded progress activity. */
export type ConsultingProgressCallback = (activity: string) => void;
