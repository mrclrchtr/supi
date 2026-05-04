import type { Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import type { ReviewTarget } from "./types.ts";

/** Progress state exposed by the runner for widget integration. */
export interface ReviewProgress {
  /** Number of agentic turns completed. */
  turns: number;
  /** Number of tool executions started. */
  toolUses: number;
  /** Human-readable activity descriptions for active tools. */
  activities: string[];
  /** Token usage stats, if available. */
  tokens?: { input: number; output: number; total: number };
}

export interface ReviewerInvocation {
  prompt: string;
  // biome-ignore lint/suspicious/noExplicitAny: Model<any> is pi's canonical type
  model: Model<any> | undefined;
  /** Model registry from the parent session — passed to createAgentSession
   *  so that provider registrations, auth, and streaming work correctly. */
  modelRegistry?: ModelRegistry;
  cwd: string;
  signal?: AbortSignal;
  target: ReviewTarget;
  timeoutMs?: number;
  /** Callback for tool activity events (starts/ends) for widget integration. */
  onToolActivity?: (event: { toolName: string; phase: "start" | "end" }) => void;
  /** Callback for progress state updates (turn count, tool uses, tokens). */
  onProgress?: (progress: ReviewProgress) => void;
}
