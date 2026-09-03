/** The four model choices SuPi may expose to a new Antigravity Run. */
export const CURATED_MODELS = Object.freeze([
  "gemini-3.8-flash-low",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-high",
  "gemini-3.1-pro-high",
] as const);

/** A model in the discovered Model Catalogue. */
export type CuratedModel = (typeof CURATED_MODELS)[number];

/** Return whether a value is one of the four curated model IDs. */
export function isCuratedModel(value: unknown): value is CuratedModel {
  return typeof value === "string" && CURATED_MODELS.includes(value as CuratedModel);
}

/** Workspace choice made by the caller. */
export type WorkspaceAccess = boolean;

/** A source returned by Antigravity's structured answer. */
export interface AntigravitySource {
  title: string;
  url: string;
}

/** A workspace path returned by Antigravity's structured answer. */
export interface AntigravityWorkspaceEvidence {
  path: string;
  summary: string;
}

/** The exact structured answer required from Antigravity. */
export interface AntigravityAnswer {
  answer: string;
  sources: AntigravitySource[];
  workspaceEvidence: AntigravityWorkspaceEvidence[];
}

/** Bounded token accounting reported by the Antigravity CLI. */
export interface AntigravityUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

/** A validated answer reference classified by its execution evidence. */
export interface ClassifiedSource extends AntigravitySource {
  evidence: "observed" | "claimed";
}

/** A validated workspace reference classified by its execution evidence. */
export interface ClassifiedWorkspaceEvidence extends AntigravityWorkspaceEvidence {
  evidence: "observed" | "claimed";
}

/** Safe process facts collected without retaining stream events. */
export interface AntigravityExecutionFacts {
  answer: AntigravityAnswer;
  conversationId: string;
  usage?: AntigravityUsage;
  observedToolNames: string[];
  observedToolCounts: Record<string, number>;
  successfulToolNames: string[];
  permissionDenials: number;
  observedSourceHashes: string[];
  observedWorkspacePathHashes: string[];
}

/** State persisted for one opaque Conversation Handle. */
export interface ConversationHandleRecord {
  handle: string;
  rawAntigravityId: string;
  model: CuratedModel;
  canonicalWorkingDirectory: string;
  workspaceAccess: WorkspaceAccess;
  cliVersion: string;
  status: "active" | "retired";
}

/** Human and model-visible details for one completed Antigravity Run. */
export interface AntigravityRunResultDetails {
  model: CuratedModel;
  workingDirectoryKind: "consultation" | "workspace";
  canonicalWorkingDirectory: string;
  workspaceAccess: WorkspaceAccess;
  cliVersion: string;
  durationMs: number;
  usage?: AntigravityUsage;
  observedToolNames: string[];
  observedToolCounts: Record<string, number>;
  permissionDenials: number;
  webUsed: boolean;
  workspaceUsed: boolean;
  ambientProjectGuidanceAvailable: boolean;
  activeProjectHookWarning?: string;
  handle: string;
  rawAntigravityId: string;
  handleState: "active";
  observedSources: ClassifiedSource[];
  claimedSources: ClassifiedSource[];
  observedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  claimedWorkspaceEvidence: ClassifiedWorkspaceEvidence[];
  warnings: string[];
}

/** Optional callback for safe progress activity. */
export type AntigravityProgressCallback = (activity: string) => void;
