import type { ConsultationAnswer, ConsultationUsage } from "../../types.ts";

/** Process facts retained only inside the Antigravity adapter. */
export interface AntigravityExecutionFacts {
  answer: ConsultationAnswer;
  conversationId: string;
  usage?: ConsultationUsage;
  observedToolNames: string[];
  observedToolCounts: Record<string, number>;
  successfulToolNames: string[];
  permissionDenials: number;
  observedSourceHashes: string[];
  observedWorkspacePathHashes: string[];
}

/** Safe, bounded progress from one Antigravity event. */
export type AntigravityProgressCallback = (activity: string) => void;
