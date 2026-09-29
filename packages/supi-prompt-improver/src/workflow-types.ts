import type { Api, Model } from "@earendil-works/pi-ai";
import type { PromptImproverContext } from "./context.ts";
import type { PromptImproverDiagnostics } from "./diagnostics.ts";
import type { CommandContext, DraftOwnership } from "./draft.ts";

export interface WorkflowState {
  ctx: CommandContext;
  model: Model<Api>;
  modelId: string;
  draft: string;
  background: PromptImproverContext;
  ownership: DraftOwnership;
  controller: AbortController;
  diagnostics: PromptImproverDiagnostics;
}

export interface PreparedProposal {
  proposal: string;
  context: PromptImproverContext;
}

export interface RunResult {
  outcome: "accepted" | "dismissed" | "unchanged" | "cancelled" | "stale" | "failed" | "rejected";
  reasonCode: string;
}
