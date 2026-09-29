import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { DEBUG_EVENT_ENTRY_TYPE, isDebugLevel } from "@mrclrchtr/supi-core/debug";
import {
  countCodePoints,
  PROMPT_IMPROVER_LIMITS,
  type PromptImproverContext,
  selectPromptImproverContext,
} from "./context.ts";
import { capturePromptImproverError, type PromptImproverDiagnostics } from "./diagnostics.ts";
import { openDraftInput } from "./ui.ts";

const UNRESOLVED_PASTE_MARKER = /\[paste #\d+(?: \+\d+ lines| \d+ chars)?\]/;

export type CommandContext = ExtensionCommandContext;

export interface DraftOwnership {
  readonly sessionId: string;
  readonly branchPosition: string;
  readonly baseline: string;
}

export type DraftTransferResult =
  | { kind: "transferred"; draft: string }
  | { kind: "rejected"; reasonCode: string; message?: string };

/** Check the command context before draft collection and model work. */
export function canRun(ctx: CommandContext): boolean {
  return ctx.mode === "tui" && ctx.hasUI && ctx.isIdle() && !ctx.hasPendingMessages();
}

/** Capture session, non-diagnostic branch, and editor identity. */
export function captureOwnership(ctx: CommandContext): DraftOwnership {
  return Object.freeze({
    sessionId: ctx.sessionManager.getSessionId(),
    branchPosition: sessionBranchPosition(ctx),
    baseline: ctx.ui.getEditorText(),
  });
}

/** Return the first changed ownership condition, or `undefined` when ownership holds. */
export function ownershipFailureReason(
  ctx: CommandContext,
  ownership: DraftOwnership,
  expectedText: string,
): string | undefined {
  if (ctx.sessionManager.getSessionId() !== ownership.sessionId) return "session_changed";
  if (sessionBranchPosition(ctx) !== ownership.branchPosition) return "branch_changed";
  if (!ctx.isIdle()) return "agent_busy";
  if (ctx.hasPendingMessages()) return "pending_messages";
  if (ctx.ui.getEditorText() !== expectedText) return "editor_changed";
  return undefined;
}

/** Open the local draft input without changing the main editor. */
export async function collectDraft(options: {
  ctx: CommandContext;
  args: string;
  signal: AbortSignal;
  modelId: string;
  diagnostics: PromptImproverDiagnostics;
}): Promise<Awaited<ReturnType<typeof openDraftInput>> | undefined> {
  try {
    return await openDraftInput(options.ctx.ui, options.args, options.signal, options.modelId);
  } catch (error) {
    options.diagnostics.record("draft.failed", "error", "Prompt draft editor failed", () => ({
      outcome: "failed",
      reasonCode: "draft_editor_open_failed",
      ...capturePromptImproverError(error),
    }));
    options.ctx.ui.notify("Prompt improvement could not open its draft editor.", "error");
    return undefined;
  }
}

/** Transfer a confirmed draft only when session, branch, and editor checks pass. */
export function transferConfirmedDraft(
  ctx: CommandContext,
  ownership: DraftOwnership,
  draft: string,
): DraftTransferResult {
  const ownershipFailure = ownershipFailureReason(ctx, ownership, ownership.baseline);
  if (ownershipFailure) return { kind: "rejected", reasonCode: ownershipFailure };
  const rejection = draftRejection(draft);
  if (rejection) return { kind: "rejected", ...rejection };

  ctx.ui.setEditorText(draft);
  const confirmedDraft = ctx.ui.getEditorText();
  if (confirmedDraft !== draft) {
    return {
      kind: "rejected",
      reasonCode: "editor_write_failed",
      message: "The editor could not keep the confirmed draft unchanged.",
    };
  }
  const postWriteFailure = ownershipFailureReason(ctx, ownership, confirmedDraft);
  if (postWriteFailure) return { kind: "rejected", reasonCode: postWriteFailure };
  return { kind: "transferred", draft: confirmedDraft };
}

/** Capture only loaded guidance and the active projected conversation. */
export function capturePromptContext(
  ctx: CommandContext,
  diagnostics: PromptImproverDiagnostics,
): PromptImproverContext | undefined {
  try {
    const options = ctx.getSystemPromptOptions();
    const guidance = copyGuidance(options.contextFiles ?? []);
    return selectPromptImproverContext(guidance, ctx.sessionManager.buildSessionProjection());
  } catch (error) {
    diagnostics.record(
      "context.failed",
      "error",
      "Prompt improvement context is unavailable",
      () => ({
        outcome: "failed",
        reasonCode: "loaded_context_unavailable",
        ...capturePromptImproverError(error),
      }),
    );
    ctx.ui.notify(
      "Loaded project context is not available. The confirmed draft was kept.",
      "error",
    );
    return undefined;
  }
}

function sessionBranchPosition(ctx: CommandContext): string {
  return ctx.sessionManager
    .getBranch()
    .filter((entry) => !isDebugEventEntry(entry))
    .map((entry) => entry.id)
    .join("/");
}

function isDebugEventEntry(
  entry: ReturnType<CommandContext["sessionManager"]["getBranch"]>[number],
): boolean {
  try {
    if (entry.type !== "custom" || entry.customType !== DEBUG_EVENT_ENTRY_TYPE) return false;
    const data: unknown = entry.data;
    if (typeof data !== "object" || data === null) return false;
    const event = data as Record<string, unknown>;
    return (
      typeof event.id === "number" &&
      Number.isFinite(event.id) &&
      typeof event.timestamp === "number" &&
      Number.isFinite(event.timestamp) &&
      typeof event.source === "string" &&
      isDebugLevel(event.level) &&
      typeof event.category === "string" &&
      typeof event.message === "string"
    );
  } catch {
    return false;
  }
}

function draftRejection(draft: string): { reasonCode: string; message: string } | undefined {
  if (!draft.trim()) {
    return { reasonCode: "empty_draft", message: "Enter a draft before you confirm it." };
  }
  if (countCodePoints(draft) > PROMPT_IMPROVER_LIMITS.draftCodePoints) {
    return {
      reasonCode: "draft_too_large",
      message: "The draft is too large. The limit is 32,000 Unicode code points.",
    };
  }
  if (UNRESOLVED_PASTE_MARKER.test(draft)) {
    return {
      reasonCode: "unresolved_paste_marker",
      message: "A pasted text block is not available. Expand it in the editor and try again.",
    };
  }
  return undefined;
}

function copyGuidance(
  records: readonly { path: string; content: string }[],
): Array<{ path: string; content: string }> {
  if (!Array.isArray(records)) throw new Error("Loaded guidance is not available.");
  return records.map((record) => {
    if (!record || typeof record.path !== "string" || typeof record.content !== "string") {
      throw new Error("Loaded guidance is not available.");
    }
    return { path: record.path, content: record.content };
  });
}
