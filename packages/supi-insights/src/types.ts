// Shared types for supi-insights

export type SessionMeta = {
  sessionId: string;
  projectPath: string;
  startTime: string;
  durationMinutes: number;
  userMessageCount: number;
  assistantMessageCount: number;
  toolCounts: Record<string, number>;
  languages: Record<string, number>;
  gitCommits: number;
  gitPushes: number;
  inputTokens: number;
  outputTokens: number;
  firstPrompt: string;
  summary?: string;
  userInterruptions: number;
  userResponseTimes: number[];
  toolErrors: number;
  toolErrorCategories: Record<string, number>;
  usesTaskAgent: boolean;
  usesMcp: boolean;
  usesWebSearch: boolean;
  usesWebFetch: boolean;
  linesAdded: number;
  linesRemoved: number;
  filesModified: number;
  messageHours: number[];
  userMessageTimestamps: string[];
};

export type SessionFacets = {
  sessionId: string;
  underlyingGoal: string;
  goalCategories: Record<string, number>;
  outcome: string;
  userSatisfactionCounts: Record<string, number>;
  claudeHelpfulness: string;
  sessionType: string;
  frictionCounts: Record<string, number>;
  frictionDetail: string;
  primarySuccess: string;
  briefSummary: string;
  userInstructionsToClaude?: string[];
};

export type AggregatedData = {
  totalSessions: number;
  totalSessionsScanned?: number;
  sessionsWithFacets: number;
  dateRange: { start: string; end: string };
  totalMessages: number;
  totalDurationHours: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  toolCounts: Record<string, number>;
  languages: Record<string, number>;
  gitCommits: number;
  gitPushes: number;
  projects: Record<string, number>;
  goalCategories: Record<string, number>;
  outcomes: Record<string, number>;
  satisfaction: Record<string, number>;
  helpfulness: Record<string, number>;
  sessionTypes: Record<string, number>;
  friction: Record<string, number>;
  success: Record<string, number>;
  sessionSummaries: Array<{
    id: string;
    date: string;
    summary: string;
    goal?: string;
  }>;
  totalInterruptions: number;
  totalToolErrors: number;
  toolErrorCategories: Record<string, number>;
  userResponseTimes: number[];
  medianResponseTime: number;
  avgResponseTime: number;
  sessionsUsingTaskAgent: number;
  sessionsUsingMcp: number;
  sessionsUsingWebSearch: number;
  sessionsUsingWebFetch: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
  totalFilesModified: number;
  daysActive: number;
  messagesPerDay: number;
  messageHours: number[];
  multiClauding: {
    overlapEvents: number;
    sessionsInvolved: number;
    userMessagesDuring: number;
  };
  /** Number of sessions attempted for LLM facet extraction. */
  facetExtractionAttempted: number;
  /** Number of sessions where LLM facet extraction failed. */
  facetExtractionFailed: number;
  /** List of insight section names that failed to generate. */
  insightSectionsFailed: string[];
};

export type InsightSectionName =
  | "projectAreas"
  | "interactionStyle"
  | "whatWorks"
  | "frictionAnalysis"
  | "suggestions"
  | "onTheHorizon"
  | "atAGlance"
  | "funEnding";

export type InsightResults = Partial<Record<InsightSectionName, unknown>>;
