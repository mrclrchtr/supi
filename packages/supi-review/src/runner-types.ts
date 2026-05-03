import type { ReviewTarget } from "./types.ts";

export interface ReviewerInvocation {
  prompt: string;
  model: string | undefined;
  cwd: string;
  signal?: AbortSignal;
  target: ReviewTarget;
  onSessionStart?: (sessionName: string) => void;
}
